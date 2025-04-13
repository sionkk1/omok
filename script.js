// script.js (Nickname Version)

// --- DOM 요소 가져오기 ---
const nameInputSection = document.getElementById('name-input-section');
const nicknameInput = document.getElementById('nickname-input');
const joinButton = document.getElementById('join-button');
const gameSection = document.getElementById('game-section');
const boardElement = document.getElementById('board');
const messageElement = document.getElementById('message');
const currentPlayerElement = document.getElementById('current-player');
const myNicknameElement = document.getElementById('my-nickname');
const opponentNicknameElement = document.getElementById('opponent-nickname');
// const resetButton = document.getElementById('reset-button');

// --- 게임 설정 ---
const BOARD_SIZE = 15;
const CELL_SIZE = 30;
const STONE_SIZE = 26;

// --- 게임 상태 변수 ---
let socket = null; // 소켓 연결 객체 (나중에 생성)
let boardState = [];
let myPlayerNumber = null;
let myNickname = '';
let opponentNickname = '';
let currentPlayer = null;
let isGameOver = false;
let canPlay = false;

// --- 함수 ---

// 게임판 초기화 (시각적 요소만)
function initializeBoardGraphics() {
    while (boardElement.firstChild) {
        boardElement.removeChild(boardElement.firstChild);
    }
    messageElement.textContent = '';
    currentPlayerElement.textContent = '대기 중...';
    myNicknameElement.textContent = myNickname || '나';
    opponentNicknameElement.textContent = opponentNickname || '상대방';
}

// 화면에 돌 그리기 (로직 동일)
function drawStone(row, col, player) {
    const existingStone = document.querySelector(`.stone[data-row="${row}"][data-col="${col}"]`);
    if (existingStone) return;

    const stone = document.createElement('div');
    stone.classList.add('stone', player === 1 ? 'black' : 'white');
    stone.dataset.row = row;
    stone.dataset.col = col;

    const left = col * CELL_SIZE - (STONE_SIZE / 2);
    const top = row * CELL_SIZE - (STONE_SIZE / 2);
    stone.style.left = `${left}px`;
    stone.style.top = `${top}px`;

    boardElement.appendChild(stone);
}

// 게임 상태 업데이트 (닉네임 포함)
function updateGameState(gameState) {
    boardState = gameState.board;
    currentPlayer = gameState.currentPlayer;
    isGameOver = gameState.isGameOver;

    // 닉네임 업데이트
    if (gameState.players) {
        if (myPlayerNumber === 1) {
            myNickname = gameState.players[1]?.nickname || '나';
            opponentNickname = gameState.players[2]?.nickname || '상대방';
        } else if (myPlayerNumber === 2) {
            myNickname = gameState.players[2]?.nickname || '나';
            opponentNickname = gameState.players[1]?.nickname || '상대방';
        }
        myNicknameElement.textContent = myNickname;
        opponentNicknameElement.textContent = opponentNickname;
    }

    canPlay = (myPlayerNumber === currentPlayer && !isGameOver);

    // 보드 다시 그리기
    initializeBoardGraphics(); // 기존 돌 지우고
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (boardState[r][c] !== 0) {
                drawStone(r, c, boardState[r][c]);
            }
        }
    }

    // 상태 메시지 업데이트 (닉네임 사용)
    let currentPlayerNickname = '';
    if (gameState.players) {
       currentPlayerNickname = gameState.players[currentPlayer]?.nickname || (currentPlayer === 1 ? '흑돌' : '백돌');
    }

    if (isGameOver) {
        let winnerNickname = '';
        if (gameState.winnerNumber && gameState.players) {
             winnerNickname = gameState.players[gameState.winnerNumber]?.nickname || (gameState.winnerNumber === 1 ? '흑돌' : '백돌');
        }
        messageElement.textContent = gameState.message || `${winnerNickname} 승리!`;
        currentPlayerElement.textContent = "-";
        canPlay = false;
    } else {
        messageElement.textContent = '';
        currentPlayerElement.textContent = `${currentPlayerNickname} 차례`;
        currentPlayerElement.style.color = currentPlayer === 1 ? 'black' : 'grey'; // 색상은 그대로 유지
    }

    boardElement.style.cursor = canPlay ? 'pointer' : 'default';
}

// 보드 클릭 이벤트 핸들러
function handleBoardClick(event) {
    if (!canPlay || isGameOver || !socket) return;

    const rect = boardElement.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    const col = Math.round(offsetX / CELL_SIZE);
    const row = Math.round(offsetY / CELL_SIZE);

    if (row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE) {
        if (boardState[row][col] === 0) {
            socket.emit('placeStone', { row, col });
            canPlay = false;
            boardElement.style.cursor = 'default';
        } else {
            console.log("이미 돌이 있는 위치입니다.");
        }
    }
}

// Socket.IO 이벤트 핸들러 설정 함수
function setupSocketListeners() {
    socket.on('playerAssignment', (playerData) => {
        myPlayerNumber = playerData.playerNumber;
        myNickname = playerData.nickname; // 서버에서 내 닉네임 다시 확인
        myNicknameElement.textContent = myNickname;
        console.log(`플레이어 번호 ${myPlayerNumber}, 닉네임 ${myNickname} 할당 받음.`);
    });

    socket.on('gameState', (gameState) => {
        console.log("게임 상태 업데이트 받음:", gameState);
        updateGameState(gameState);
    });

    socket.on('message', (msg) => {
        messageElement.textContent = msg;
    });

    socket.on('disconnect', () => {
        messageElement.textContent = '서버 연결 끊어짐';
        isGameOver = true;
        canPlay = false;
        boardElement.style.cursor = 'default';
        // 필요시 이름 입력 섹션 다시 보이게 처리
        gameSection.classList.add('hidden');
        nameInputSection.classList.remove('hidden');
        socket = null;
    });
}

// --- 게임 시작 로직 ---
joinButton.addEventListener('click', () => {
    const nickname = nicknameInput.value.trim();
    if (!nickname) {
        alert('닉네임을 입력해주세요.');
        return;
    }
    if (nickname.length > 10) {
         alert('닉네임은 10자 이하로 입력해주세요.');
         return;
    }


    myNickname = nickname; // 입력한 닉네임 저장

    // 입력 섹션 숨기고 게임 섹션 표시
    nameInputSection.classList.add('hidden');
    gameSection.classList.remove('hidden');
    initializeBoardGraphics(); // 게임판 초기화 및 내 닉네임 표시
    messageElement.textContent = '서버에 연결 중...';


    // 서버 연결 시도
    // 서버 주소 확인! (Render 등 배포된 주소 사용)
    // const serverUrl = 'http://localhost:3000'; // 로컬 테스트 시
    const serverUrl = 'https://내게임주소.onrender.com'; // <<= 실제 배포된 서버 주소로 변경하세요!!!
    socket = io(serverUrl);


    // 연결 성공 시 닉네임 전송
    socket.on('connect', () => {
        console.log('서버 연결 성공:', socket.id);
        messageElement.textContent = '서버 연결 성공! 다른 플레이어 기다리는 중...';
        socket.emit('setNickname', myNickname); // 서버에 닉네임 알리기

        // 연결 성공 후 이벤트 리스너 설정
        setupSocketListeners();
    });

    // 연결 실패 시
    socket.on('connect_error', (err) => {
         console.error('서버 연결 실패:', err);
         messageElement.textContent = '서버 연결에 실패했습니다. 새로고침 후 다시 시도해주세요.';
         // 게임 섹션 다시 숨기고 이름 입력 섹션 표시
         gameSection.classList.add('hidden');
         nameInputSection.classList.remove('hidden');
         socket = null; // 소켓 객체 초기화
    });

});

boardElement.addEventListener('click', handleBoardClick);
// resetButton 리스너는 일단 비활성화
