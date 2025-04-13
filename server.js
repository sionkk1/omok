// server.js (Online Version)

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // 실제 서비스 시에는 특정 도메인만 허용하세요.
    methods: ["GET", "POST"]
  }
});

const BOARD_SIZE = 15;

// --- 게임 관리 ---
let waitingPlayer = null; // 대기 중인 플레이어의 소켓
let activeGames = {}; // 진행 중인 게임 관리 (gameId -> gameState)

// 게임 상태 초기화 함수
function createInitialGameState() {
    return {
        board: Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(0)),
        players: { 1: null, 2: null }, // 플레이어 소켓 ID 저장
        currentPlayer: 1, // 흑돌(1) 선공
        isGameOver: false,
        message: ''
    };
}

// 승리 조건 확인 함수 (클라이언트와 동일 로직)
function checkWin(board, row, col) {
    const player = board[row][col];
    if (player === 0) return false;
    const directions = [{ dr: 0, dc: 1 },{ dr: 1, dc: 0 },{ dr: 1, dc: 1 },{ dr: 1, dc: -1 }];
    for (const { dr, dc } of directions) {
        let count = 1;
        for (let i = 1; i < 5; i++) { const nr=row+dr*i, nc=col+dc*i; if(nr>=0&&nr<BOARD_SIZE&&nc>=0&&nc<BOARD_SIZE&&board[nr][nc]===player) count++; else break; }
        for (let i = 1; i < 5; i++) { const nr=row-dr*i, nc=col-dc*i; if(nr>=0&&nr<BOARD_SIZE&&nc>=0&&nc<BOARD_SIZE&&board[nr][nc]===player) count++; else break; }
        if (count >= 5) return true;
    }
    return false;
}
// 무승부 확인 함수
function checkDraw(board) {
    return board.flat().every(cell => cell !== 0);
}


// --- Socket.IO 연결 처리 ---
io.on('connection', (socket) => {
    console.log('사용자 연결:', socket.id);

    // --- 플레이어 매칭 ---
    if (waitingPlayer) {
        // 게임 시작
        const player1Socket = waitingPlayer;
        const player2Socket = socket;
        waitingPlayer = null; // 대기열 비우기

        const gameId = `game_${player1Socket.id}_${player2Socket.id}`;
        const gameState = createInitialGameState();
        gameState.players[1] = player1Socket.id;
        gameState.players[2] = player2Socket.id;
        activeGames[gameId] = gameState;

        // 각 플레이어를 게임 ID 기반의 "방(room)"에 참가시킴
        player1Socket.join(gameId);
        player2Socket.join(gameId);

        // 각 플레이어에게 자신이 몇 번 플레이어인지 알려줌
        player1Socket.emit('playerAssignment', 1);
        player2Socket.emit('playerAssignment', 2);

        // 두 플레이어 모두에게 게임 시작 상태 전송
        io.to(gameId).emit('gameState', gameState);
        console.log(`게임 시작: ${gameId} (Player1: ${player1Socket.id}, Player2: ${player2Socket.id})`);

    } else {
        // 대기열에 추가
        waitingPlayer = socket;
        socket.emit('message', '다른 플레이어를 기다리는 중...');
        console.log(`플레이어 대기 중: ${socket.id}`);
    }

    // --- 게임 이벤트 처리 ---
    socket.on('placeStone', (data) => {
        console.log(`돌 놓기 요청 받음 (${socket.id}):`, data);

        // 1. 이 소켓이 참여 중인 게임 찾기
        let currentGameId = null;
        let playerNumber = null;
        for (const id in activeGames) {
            if (activeGames[id].players[1] === socket.id) {
                currentGameId = id;
                playerNumber = 1;
                break;
            }
            if (activeGames[id].players[2] === socket.id) {
                currentGameId = id;
                playerNumber = 2;
                break;
            }
        }

        if (!currentGameId) {
            console.log(`오류: 게임을 찾을 수 없음 (${socket.id})`);
            return; // 참여 중인 게임 없음
        }

        const gameState = activeGames[currentGameId];

        // 2. 유효성 검사 (게임 종료 여부, 현재 턴, 빈 칸 여부)
        if (gameState.isGameOver) return;
        if (gameState.currentPlayer !== playerNumber) {
            console.log(`오류: 차례 아님 (요청: ${playerNumber}, 현재: ${gameState.currentPlayer})`);
            return; // 자기 턴 아님
        }
        if (data.row < 0 || data.row >= BOARD_SIZE || data.col < 0 || data.col >= BOARD_SIZE || gameState.board[data.row][data.col] !== 0) {
            console.log(`오류: 잘못된 위치 (요청: ${data.row},${data.col})`);
            return; // 잘못된 위치
        }

        // 3. 게임 상태 업데이트
        gameState.board[data.row][data.col] = playerNumber;

        // 4. 승리/무승부 확인
        const win = checkWin(gameState.board, data.row, data.col);
        const draw = !win && checkDraw(gameState.board);

        if (win) {
            gameState.isGameOver = true;
            gameState.message = `${playerNumber === 1 ? '흑돌' : '백돌'} 승리!`;
        } else if (draw) {
            gameState.isGameOver = true;
            gameState.message = '무승부!';
        } else {
            // 5. 턴 넘기기
            gameState.currentPlayer = playerNumber === 1 ? 2 : 1;
        }

        // 6. 모든 클라이언트에게 변경된 게임 상태 전송
        io.to(currentGameId).emit('gameState', gameState);

        // 게임 종료 시 게임 데이터 정리 (선택적)
        if (gameState.isGameOver) {
             console.log(`게임 종료: ${currentGameId}, 결과: ${gameState.message}`);
             // delete activeGames[currentGameId]; // 바로 지우면 클라이언트가 마지막 상태를 못 받을 수 있음. 잠시 후 지우거나 다른 방식 사용.
        }
    });

    // --- 연결 해제 처리 ---
    socket.on('disconnect', () => {
        console.log('사용자 연결 해제:', socket.id);

        // 대기 중인 플레이어였는지 확인
        if (waitingPlayer === socket) {
            waitingPlayer = null;
            console.log('대기 중인 플레이어 나감');
            return;
        }

        // 진행 중인 게임이 있었는지 확인
        let currentGameId = null;
        for (const id in activeGames) {
            if (activeGames[id].players[1] === socket.id || activeGames[id].players[2] === socket.id) {
                currentGameId = id;
                break;
            }
        }

        if (currentGameId) {
            const gameState = activeGames[currentGameId];
            console.log(`게임 ${currentGameId}에서 플레이어 나감: ${socket.id}`);

            // 상대방에게 알리기 (게임 종료 처리)
            gameState.isGameOver = true;
            gameState.message = '상대방이 나갔습니다.';
            // 방(room)에 남아있는 다른 플레이어에게만 메시지 보내기
            socket.to(currentGameId).emit('gameState', gameState);

            // 서버에서 게임 정보 삭제
            delete activeGames[currentGameId];
        }
    });
});

// 서버 시작
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`${PORT}번 포트에서 서버가 실행 중입니다.`);
});

// 기본 Express 라우트 (테스트용)
app.get('/', (req, res) => {
  res.send('<h1>온라인 오목 게임 서버</h1>');
});