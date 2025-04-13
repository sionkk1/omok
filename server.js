// server.js (Nickname Version)

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const BOARD_SIZE = 15;

// --- 게임 관리 ---
let nicknames = {}; // 소켓 ID를 키로 닉네임을 저장: { socketId: 'nickname', ... }
let waitingPlayerSocket = null; // 대기 중인 플레이어 소켓
let activeGames = {}; // gameId -> gameState

// 게임 상태 초기화 함수 (플레이어 정보 구조 변경)
function createInitialGameState() {
    return {
        board: Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(0)),
        players: { // 플레이어 번호(1, 2)를 키로 사용
            1: { id: null, nickname: null },
            2: { id: null, nickname: null }
        },
        currentPlayer: 1,
        isGameOver: false,
        winnerNumber: null, // 승자 플레이어 번호
        message: ''
    };
}

// 승리/무승부 확인 함수 (기존과 동일)
function checkWin(board, row, col) { /* ... 기존 코드와 동일 ... */ }
function checkDraw(board) { /* ... 기존 코드와 동일 ... */ }
// --- 위 checkWin, checkDraw 함수는 이전 코드와 동일하게 유지 ---
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
function checkDraw(board) {
    return board.flat().every(cell => cell !== 0);
}


// --- Socket.IO 연결 처리 ---
io.on('connection', (socket) => {
    console.log('사용자 연결 시도:', socket.id);

    // 닉네임 설정 이벤트 리스너
    socket.on('setNickname', (nickname) => {
        // 간단한 유효성 검사 (길이 등) - 필요시 추가
        const cleanNickname = nickname.trim().slice(0, 10) || `익명_${socket.id.slice(0,4)}`;
        nicknames[socket.id] = cleanNickname;
        console.log(`닉네임 설정됨: ${socket.id} -> ${cleanNickname}`);

        // --- 플레이어 매칭 로직 (닉네임 설정 후 진행) ---
        if (waitingPlayerSocket) {
            // 이미 대기자가 있으면 게임 시작
            const player1Socket = waitingPlayerSocket;
            const player2Socket = socket;
            waitingPlayerSocket = null; // 대기열 비우기

            // 두 플레이어 모두 닉네임이 설정되었는지 확인 (타이밍 이슈 방지)
            if (!nicknames[player1Socket.id] || !nicknames[player2Socket.id]) {
                console.error("오류: 플레이어 닉네임이 설정되지 않았습니다.");
                // 에러 처리 또는 재시도 로직 필요
                return;
            }

            const gameId = `game_${player1Socket.id}_${player2Socket.id}`;
            const gameState = createInitialGameState();

            // 플레이어 정보 설정 (ID와 닉네임 포함)
            gameState.players[1] = { id: player1Socket.id, nickname: nicknames[player1Socket.id] };
            gameState.players[2] = { id: player2Socket.id, nickname: nicknames[player2Socket.id] };
            activeGames[gameId] = gameState;

            player1Socket.join(gameId);
            player2Socket.join(gameId);

            // 각 플레이어에게 플레이어 번호와 자신의 닉네임 전달 (재확인용)
            player1Socket.emit('playerAssignment', { playerNumber: 1, nickname: gameState.players[1].nickname });
            player2Socket.emit('playerAssignment', { playerNumber: 2, nickname: gameState.players[2].nickname });

            // 게임 시작 상태 전송 (이제 플레이어 닉네임 포함)
            io.to(gameId).emit('gameState', gameState);
            console.log(`게임 시작: ${gameId} (${gameState.players[1].nickname} vs ${gameState.players[2].nickname})`);

        } else {
            // 대기자가 없으면 현재 플레이어를 대기열에 추가
            waitingPlayerSocket = socket;
            socket.emit('message', '다른 플레이어를 기다리는 중...');
            console.log(`플레이어 대기 중: ${socket.id} (${nicknames[socket.id]})`);
        }
    });


    // --- 게임 이벤트 처리 ---
    socket.on('placeStone', (data) => {
        // 1. 게임 찾기 및 플레이어 번호 확인
        let currentGameId = null;
        let playerNumber = null;
        for (const id in activeGames) {
            if (activeGames[id].players[1].id === socket.id) { currentGameId = id; playerNumber = 1; break; }
            if (activeGames[id].players[2].id === socket.id) { currentGameId = id; playerNumber = 2; break; }
        }
        if (!currentGameId) return;
        const gameState = activeGames[currentGameId];
        const playerNickname = gameState.players[playerNumber].nickname; // 현재 플레이어 닉네임

        // 2. 유효성 검사
        if (gameState.isGameOver || gameState.currentPlayer !== playerNumber || data.row < 0 || data.row >= BOARD_SIZE || data.col < 0 || data.col >= BOARD_SIZE || gameState.board[data.row][data.col] !== 0) {
            console.log(`잘못된 요청: ${playerNickname} (${socket.id}), row:${data.row}, col:${data.col}`);
            // 필요시 클라이언트에 오류 메시지 전송
            // socket.emit('invalidMove', '둘 수 없는 위치입니다.');
            return;
        }
        console.log(`돌 놓기: ${playerNickname} (${playerNumber}), row:${data.row}, col:${data.col}`);

        // 3. 게임 상태 업데이트
        gameState.board[data.row][data.col] = playerNumber;

        // 4. 승리/무승부 확인
        const win = checkWin(gameState.board, data.row, data.col);
        const draw = !win && checkDraw(gameState.board);

        if (win) {
            gameState.isGameOver = true;
            gameState.winnerNumber = playerNumber; // 승자 번호 기록
            gameState.message = `${playerNickname} 승리!`;
        } else if (draw) {
            gameState.isGameOver = true;
            gameState.winnerNumber = null; // 무승부
            gameState.message = '무승부!';
        } else {
            // 5. 턴 넘기기
            gameState.currentPlayer = playerNumber === 1 ? 2 : 1;
        }

        // 6. 게임 상태 전송 (닉네임 포함된 상태)
        io.to(currentGameId).emit('gameState', gameState);

        if (gameState.isGameOver) {
             console.log(`게임 종료: ${currentGameId}, 결과: ${gameState.message}`);
        }
    });

    // --- 연결 해제 처리 ---
    socket.on('disconnect', () => {
        const disconnectedNickname = nicknames[socket.id] || socket.id;
        console.log('사용자 연결 해제:', disconnectedNickname);

        // 닉네임 정보 삭제
        delete nicknames[socket.id];

        // 대기 중인 플레이어였는지 확인
        if (waitingPlayerSocket === socket) {
            waitingPlayerSocket = null;
            console.log('대기 중인 플레이어 나감');
            return;
        }

        // 진행 중인 게임 찾기
        let currentGameId = null;
        let opponentSocketId = null;
        for (const id in activeGames) {
            const game = activeGames[id];
            if (game.players[1].id === socket.id) {
                currentGameId = id;
                opponentSocketId = game.players[2].id;
                break;
            }
            if (game.players[2].id === socket.id) {
                currentGameId = id;
                opponentSocketId = game.players[1].id;
                break;
            }
        }

        if (currentGameId) {
            const gameState = activeGames[currentGameId];
            console.log(`게임 ${currentGameId}에서 플레이어 나감: ${disconnectedNickname}`);

            // 상대방에게 알리기 (게임 종료 처리)
            if (!gameState.isGameOver) { // 이미 게임이 끝나지 않았다면
                gameState.isGameOver = true;
                gameState.winnerNumber = null; // 나간 경우는 승자 없음
                gameState.message = `${disconnectedNickname} 님이 나갔습니다.`;

                // 남아있는 상대방에게 업데이트된 상태 전송
                if (opponentSocketId && io.sockets.sockets.get(opponentSocketId)) {
                     io.to(opponentSocketId).emit('gameState', gameState);
                }
            }
            // 서버에서 게임 정보 삭제
            delete activeGames[currentGameId];
        }
    });
});

// 서버 시작 (포트 등 기존과 동일)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`${PORT}번 포트에서 서버가 실행 중입니다.`);
});

app.get('/', (req, res) => {
  res.send('<h1>온라인 오목 게임 서버 (Nickname ver.)</h1>');
});
