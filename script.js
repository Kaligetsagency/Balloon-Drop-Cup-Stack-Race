// --- Game State ---
const WIN_SCORE = 50;
let isHost = true;
let isAI = false;
let peer = null;
let conn = null;

let state = {
    p1Score: 0, p2Score: 0,
    p1Temp: 0, p2Temp: 0,
    balloonY: 0, // 0 to 100 (percentage)
    isPlaying: false
};

let gameLoopInterval;
let aiInterval;
let balloonSpeed = 0.5;

// --- DOM Elements ---
const screens = {
    lobby: document.getElementById('lobby'),
    game: document.getElementById('game'),
    gameOver: document.getElementById('game-over')
};

const ui = {
    myId: document.getElementById('my-id'),
    joinId: document.getElementById('join-id'),
    status: document.getElementById('connection-status'),
    p1Score: document.getElementById('p1-score'),
    p2Score: document.getElementById('p2-score'),
    p1Temp: document.getElementById('p1-temp'),
    p2Temp: document.getElementById('p2-temp'),
    p2Name: document.getElementById('p2-name'),
    balloon: document.getElementById('balloon'),
    winnerText: document.getElementById('winner-text'),
    finalScoreText: document.getElementById('final-score-text')
};

// --- Initialization & PeerJS ---
function initPeer() {
    peer = new Peer();
    peer.on('open', id => {
        ui.myId.innerText = id;
    });

    // Handle incoming connections (Guest joining Host)
    peer.on('connection', connection => {
        conn = connection;
        isHost = true;
        isAI = false;
        setupConnection();
    });
}

function joinPeer(id) {
    if (!peer) return;
    ui.status.innerText = "Connecting...";
    conn = peer.connect(id);
    isHost = false;
    isAI = false;
    setupConnection();
}

function setupConnection() {
    conn.on('open', () => {
        ui.status.innerText = "Connected!";
        ui.p2Name.innerText = "Player 2";
        setTimeout(() => startGame(), 1000);
    });

    conn.on('data', data => {
        if (data.type === 'SYNC' && !isHost) {
            // Guest updates state from host
            state = data.state;
            updateUI();
        } else if (data.type === 'ACTION' && isHost) {
            // Host processes guest actions
            handleAction(data.action, 'p2');
        } else if (data.type === 'REPLAY') {
            startGame();
        }
    });

    conn.on('close', () => {
        alert("Opponent disconnected.");
        showScreen('lobby');
    });
}

// --- Navigation ---
function showScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenName].classList.add('active');
}

// --- Game Logic ---
function startGame() {
    state = { p1Score: 0, p2Score: 0, p1Temp: 0, p2Temp: 0, balloonY: 0, isPlaying: true };
    balloonSpeed = 0.5;
    updateUI();
    showScreen('game');

    if (isHost) {
        clearInterval(gameLoopInterval);
        gameLoopInterval = setInterval(gameTick, 50);
    }
    
    if (isAI) startAI();
}

function gameTick() {
    if (!state.isPlaying) return;

    // Balloon falls
    state.balloonY += balloonSpeed;
    
    // Balloon hits the floor
    if (state.balloonY >= 100) {
        state.balloonY = 0;
        state.p1Temp = 0;
        state.p2Temp = 0;
        balloonSpeed = Math.min(balloonSpeed + 0.1, 1.5); // Gets faster
    }

    if (isHost && !isAI) {
        conn.send({ type: 'SYNC', state: state });
    }
    updateUI();
}

function handleAction(action, player) {
    if (!state.isPlaying) return;

    if (action === 'STACK') {
        if (player === 'p1') state.p1Temp++;
        if (player === 'p2') state.p2Temp++;
    } 
    else if (action === 'CATCH') {
        if (player === 'p1') {
            state.p1Score += state.p1Temp;
            state.p2Temp = 0; // Destroy opponent temp
        } else {
            state.p2Score += state.p2Temp;
            state.p1Temp = 0;
        }
        
        state.p1Temp = 0;
        state.p2Temp = 0;
        state.balloonY = 0; // Reset balloon

        checkWin();
    }
    
    if (isHost && !isAI) conn.send({ type: 'SYNC', state: state });
    updateUI();
}

function checkWin() {
    if (state.p1Score >= WIN_SCORE || state.p2Score >= WIN_SCORE) {
        state.isPlaying = false;
        clearInterval(gameLoopInterval);
        if (isAI) clearInterval(aiInterval);

        let winner = "Draw";
        if (state.p1Score > state.p2Score) winner = "You Win!";
        else if (state.p2Score > state.p1Score) winner = "Opponent Wins!";

        ui.winnerText.innerText = winner;
        ui.finalScoreText.innerText = `${state.p1Score} - ${state.p2Score}`;
        
        setTimeout(() => showScreen('gameOver'), 1000);
    }
}

function updateUI() {
    ui.p1Score.innerText = state.p1Score;
    ui.p2Score.innerText = state.p2Score;
    ui.p1Temp.innerText = state.p1Temp;
    ui.p2Temp.innerText = state.p2Temp;
    ui.balloon.style.top = `${state.balloonY}%`;
}

// --- AI Logic (Very Hard) ---
function startAI() {
    ui.p2Name.innerText = "Computer (Hard)";
    clearInterval(aiInterval);
    
    aiInterval = setInterval(() => {
        if (!state.isPlaying) return;
        
        // AI Stacks incredibly fast (every ~150ms)
        if (Math.random() > 0.3) {
            handleAction('STACK', 'p2');
        }

        // AI Catch logic: push luck, but catch if balloon is very low or has high temp score
        let catchProbability = 0;
        if (state.balloonY > 85) catchProbability = 0.8; // Panic catch
        if (state.p2Temp > 10 && state.balloonY > 50) catchProbability = 0.3; 
        if (state.p1Temp > 15) catchProbability = 0.5; // Catch to deny player

        if (Math.random() < catchProbability) {
            handleAction('CATCH', 'p2');
        }

    }, 150);
}

// --- Event Listeners ---
document.getElementById('btn-ai').addEventListener('click', () => {
    isAI = true;
    isHost = true;
    startGame();
});

document.getElementById('btn-copy-id').addEventListener('click', () => {
    navigator.clipboard.writeText(ui.myId.innerText);
    alert("ID Copied!");
});

document.getElementById('btn-join').addEventListener('click', () => {
    const id = ui.joinId.value;
    if (id) joinPeer(id);
});

// Controls
document.getElementById('btn-stack').addEventListener('touchstart', (e) => { e.preventDefault(); handlePlayerInput('STACK'); });
document.getElementById('btn-stack').addEventListener('mousedown', () => handlePlayerInput('STACK'));

document.getElementById('btn-catch').addEventListener('touchstart', (e) => { e.preventDefault(); handlePlayerInput('CATCH'); });
document.getElementById('btn-catch').addEventListener('mousedown', () => handlePlayerInput('CATCH'));

function handlePlayerInput(action) {
    if (isHost) {
        handleAction(action, 'p1');
    } else {
        conn.send({ type: 'ACTION', action: action });
    }
}

// Replay
document.getElementById('btn-replay').addEventListener('click', () => {
    if (!isAI && conn) conn.send({ type: 'REPLAY' });
    startGame();
});

document.getElementById('btn-menu').addEventListener('click', () => {
    if (conn) { conn.close(); conn = null; }
    isAI = false;
    showScreen('lobby');
});

// Start
initPeer();
