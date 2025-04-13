// script.js (Online Version)

// --- DOM 요소 가져오기 ---
const boardElement = document.getElementById('board');
const messageElement = document.getElementById('message');
const currentPlayerElement = document.getElementById('current-player');
const playerColorElement = document.getElementById('player-color');
const resetButton = document.getElementById('reset-button'); // 아직 기능 없음

// --- 게임 설정 ---
const BOARD_SIZE = 15;
const CELL_SIZE = 30;
const STONE_SIZE = 26;

// --- 게임 상태 변수 ---
let boardState = []; // 게임판 상태 (서버로부터 받아서 업데이트)
let myPlayerNumber = null; // 내가 흑(1)인지 백(2)인지 (서버로부터 받음)
let currentPlayer = null; // 현재 턴 플레이어 (서버로부터 받음)
let isGameOver = false;
let canPlay = false; // 내 턴일 때만 true

// --- 서버 연결 ---
// 서버 주소 입력 (만약 서버가 다른 곳에 있다면 해당 주소로 변경)
const socket = io('https://gomoku-game-rgag.onrender.com');

// --- 함수 ---

// 게임판 초기화 (시각적 요소만)
function initializeBoardGraphics() {
    while (boardElement.firstChild) {
        boardElement.removeChild(boardElement.firstChild);
    }
    messageElement.textContent = '';
    currentPlayerElement.textContent = '대기 중...';
    playerColorElement.textContent = '?';
}

// 화면에 돌 그리기 (로직 동일)
function drawStone(row, col, player) {
    // 이미 돌이 있는지 확인 (중복 그리기 방지 - 서버 동기화 오류 시 필요할 수 있음)
    const existingStone = document.querySelector(`.stone[data-row="${row}"][data-col="${col}"]`);
    if (existingStone) return;

    const stone = document.createElement('div');
    stone.classList.add('stone', player === 1 ? 'black' : 'white');
    stone.dataset.row = row; // 위치 정보 저장 (중복 방지용)
    stone.dataset.col = col;

    const left = col * CELL_SIZE - (STONE_SIZE / 2);
    const top = row * CELL_SIZE - (STONE_SIZE / 2);
    stone.style.left = `${left}px`;
    stone.style.top = `${top}px`;

    boardElement.appendChild(stone);
}

// 게임 상태 업데이트 (서버로부터 받은 정보로)
function updateGameState(gameState) {
    boardState = gameState.board;
    currentPlayer = gameState.currentPlayer;
    isGameOver = gameState.isGameOver;
    canPlay = (myPlayerNumber === currentPlayer && !isGameOver);

    // 보드 다시 그리기 (매번 전체를 그리는 방식 - 간단하지만 비효율적일 수 있음)
    // 또는 변경된 부분만 그리는 방식으로 최적화 가능
    initializeBoardGraphics(); // 일단 기존 돌 지우고
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (boardState[r][c] !== 0) {
                drawStone(r, c, boardState[r][c]);
            }
        }
    }

    // 상태 메시지 업데이트
    if (isGameOver) {
        messageElement.textContent = gameState.message || `${currentPlayer === 1 ? '흑돌' : '백돌'} 승리!`;
        currentPlayerElement.textContent = "-";
        canPlay = false;
    } else {
        messageElement.textContent = '';
        currentPlayerElement.textContent = `${currentPlayer === 1 ? '흑돌' : '백돌'} 차례`;
        currentPlayerElement.style.color = currentPlayer === 1 ? 'black' : 'grey';
    }

    // 보드 클릭 가능/불가능 상태 업데이트 (내 턴이면 커서 변경 등)
    boardElement.style.cursor = canPlay ? 'pointer' : 'default';
}


// 보드 클릭 이벤트 핸들러
function handleBoardClick(event) {
    if (!canPlay || isGameOver) return; // 내 턴이 아니거나 게임 종료 시 무시

    const rect = boardElement.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;

    const col = Math.round(offsetX / CELL_SIZE);
    const row = Math.round(offsetY / CELL_SIZE);

    // 유효 범위 체크 및 빈 칸인지 확인 (클라이언트에서도 간단히 체크)
    if (row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE) {
        if (boardState[row][col] === 0) {
            // 서버에 돌 놓기 요청 보내기
            socket.emit('placeStone', { row, col });
            // 요청 보낸 후에는 잠시 클릭 비활성화 (서버 응답 기다림)
            canPlay = false;
            boardElement.style.cursor = 'default';
        } else {
            console.log("이미 돌이 있는 위치입니다.");
        }
    }
}

// --- Socket.IO 이벤트 핸들러 ---

// 서버로부터 플레이어 정보 받기
socket.on('playerAssignment', (playerNumber) => {
    myPlayerNumber = playerNumber;
    playerColorElement.textContent = myPlayerNumber === 1 ? '흑돌' : '백돌';
    playerColorElement.style.color = myPlayerNumber === 1 ? 'black' : 'grey';
    console.log(`당신은 플레이어 ${myPlayerNumber} (${playerColorElement.textContent}) 입니다.`);
});

// 게임 시작 또는 상태 업데이트 메시지 받기
socket.on('gameState', (gameState) => {
    console.log("게임 상태 업데이트 받음:", gameState);
    updateGameState(gameState);
});

// 서버로부터 메시지 받기 (대기, 상대방 나감 등)
socket.on('message', (msg) => {
    messageElement.textContent = msg;
});

// 연결 해제 시
socket.on('disconnect', () => {
    messageElement.textContent = '서버 연결 끊어짐';
    isGameOver = true;
    canPlay = false;
    boardElement.style.cursor = 'default';
});


// --- 이벤트 리스너 연결 ---
boardElement.addEventListener('click', handleBoardClick);
// resetButton.addEventListener('click', () => { /* 온라인 리셋 로직 필요 */ });

// --- 초기화 ---
initializeBoardGraphics(); // 처음에는 빈 보드 표시
messageElement.textContent = '서버에 연결 중...';

console.log('클라이언트 스크립트 로드 완료');
