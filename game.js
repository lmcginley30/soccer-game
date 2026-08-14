const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const difficultySelect = document.getElementById("difficulty");
const restartButton = document.getElementById("restartButton");
const soundButton = document.getElementById("soundButton");

const keys = {};
const fans = [];

let soundEnabled = true;
let audioContext;
let score = 0;
let timeLeft = 55;
let gameOver = false;
let gameResult = "";
let message = "";
let celebrationFrames = 0;
let lastTime = 0;
let timerAccumulator = 0;
let kickCooldown = 0;

const field = {
  top: 160,
  bottom: 750,
  left: 20,
  right: 1180
};

const goal = {
  lineX: 1140,
  netX: 1190,
  top: 300,
  bottom: 610
};

const player = {
  x: 150,
  y: 455,
  radius: 22,
  speed: 5.6,
  color: "#176af2"
};

const ball = {
  x: 600,
  y: 455,
  radius: 14,
  dx: 0,
  dy: 0,
  friction: 0.986
};

const defender = {
  x: 770,
  y: 455,
  radius: 25,
  speed: 2.05,
  color: "#e63737",
  targetX: 770,
  targetY: 455
};

const goalkeeper = {
  x: 1112,
  y: 455,
  radius: 24,
  speed: 2.35,
  color: "#ffbe18",
  targetY: 455,
  reactionDelay: 18,
  reactionCounter: 0
};

const difficultySettings = {
  easy: {
    keeperSpeed: 1.35,
    defenderSpeed: 1.25,
    reactionDelay: 42,
    keeperRadius: 20,
    time: 70
  },
  medium: {
    keeperSpeed: 2.35,
    defenderSpeed: 2.05,
    reactionDelay: 18,
    keeperRadius: 24,
    time: 55
  },
  hard: {
    keeperSpeed: 3.65,
    defenderSpeed: 3,
    reactionDelay: 4,
    keeperRadius: 28,
    time: 45
  }
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createFans() {
  const colors = [
    "#e63434",
    "#1b72e8",
    "#ffd027",
    "#f7f7f7",
    "#9b45db",
    "#23b86a",
    "#ff7c22"
  ];

  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 50; col++) {
      fans.push({
        x: 18 + col * 24 + Math.random() * 7,
        y: 30 + row * 23 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        bounceOffset: Math.random() * Math.PI * 2
      });
    }
  }
}

function initializeAudio() {
  if (!audioContext) {
    audioContext = new (
      window.AudioContext || window.webkitAudioContext
    )();
  }

  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
}

function playTone(frequency, duration, type = "sine", volume = 0.1, delay = 0) {
  if (!soundEnabled) return;

  initializeAudio();

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const startTime = audioContext.currentTime + delay;

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);

  gain.gain.setValueAtTime(0.001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  oscillator.connect(gain);
  gain.connect(audioContext.destination);

  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.03);
}

function playKickSound() {
  playTone(130, 0.08, "triangle", 0.12);
}

function playSaveSound() {
  playTone(90, 0.12, "square", 0.08);
}

function playGoalSound() {
  playTone(523, 0.13, "sine", 0.13);
  playTone(659, 0.13, "sine", 0.13, 0.12);
  playTone(784, 0.28, "sine", 0.16, 0.24);
}

function applyDifficulty() {
  const setting = difficultySettings[difficultySelect.value];

  goalkeeper.speed = setting.keeperSpeed;
  goalkeeper.radius = setting.keeperRadius;
  goalkeeper.reactionDelay = setting.reactionDelay;

  defender.speed = setting.defenderSpeed;
  timeLeft = setting.time;
}

function resetPositions() {
  player.x = 150;
  player.y = 455;

  ball.x = 600;
  ball.y = 455;
  ball.dx = 0;
  ball.dy = 0;

  defender.x = 770;
  defender.y = 455;
  defender.targetX = 770;
  defender.targetY = 455;

  goalkeeper.x = 1112;
  goalkeeper.y = 455;
  goalkeeper.targetY = 455;
  goalkeeper.reactionCounter = 0;
}

function resetGame() {
  applyDifficulty();

  score = 0;
  gameOver = false;
  gameResult = "";
  message = "";
  celebrationFrames = 0;
  timerAccumulator = 0;
  kickCooldown = 0;

  resetPositions();
}

function updatePlayer() {
  if (keys.arrowup || keys.w) player.y -= player.speed;
  if (keys.arrowdown || keys.s) player.y += player.speed;
  if (keys.arrowleft || keys.a) player.x -= player.speed;
  if (keys.arrowright || keys.d) player.x += player.speed;

  player.x = clamp(
    player.x,
    field.left + player.radius,
    field.right - player.radius
  );

  player.y = clamp(
    player.y,
    field.top + player.radius,
    field.bottom - player.radius
  );
}

function kickBall() {
  if (kickCooldown > 0) return;

  const dx = ball.x - player.x;
  const dy = ball.y - player.y;
  const ballDistance = Math.hypot(dx, dy);
  const contactDistance = player.radius + ball.radius;

  if (ballDistance < contactDistance && ballDistance > 0) {
    const force = 8.5;

    ball.dx = (dx / ballDistance) * force;
    ball.dy = (dy / ballDistance) * force;

    ball.x = player.x + (dx / ballDistance) * contactDistance;
    ball.y = player.y + (dy / ballDistance) * contactDistance;

    kickCooldown = 10;
    playKickSound();
  }
}

function updateDefender() {
  defender.targetX = clamp(ball.x + 135, 700, 990);

  defender.targetY = clamp(
    ball.y,
    field.top + defender.radius,
    field.bottom - defender.radius
  );

  const dx = defender.targetX - defender.x;
  const dy = defender.targetY - defender.y;
  const moveDistance = Math.hypot(dx, dy);

  if (moveDistance > defender.speed) {
    defender.x += (dx / moveDistance) * defender.speed;
    defender.y += (dy / moveDistance) * defender.speed;
  }

  defender.x = clamp(defender.x, 650, 1010);
  defender.y = clamp(
    defender.y,
    field.top + defender.radius,
    field.bottom - defender.radius
  );

  const ballDx = ball.x - defender.x;
  const ballDy = ball.y - defender.y;
  const ballDistance = Math.hypot(ballDx, ballDy);
  const contactDistance = defender.radius + ball.radius;

  if (ballDistance < contactDistance && ballDistance > 0) {
    const clearForce = 8;

    ball.dx = (ballDx / ballDistance) * clearForce - 2.8;
    ball.dy = (ballDy / ballDistance) * clearForce;

    ball.x = defender.x + (ballDx / ballDistance) * contactDistance;
    ball.y = defender.y + (ballDy / ballDistance) * contactDistance;

    message = "BLOCKED!";
    playSaveSound();

    setTimeout(() => {
      if (!gameOver && celebrationFrames === 0) {
        message = "";
      }
    }, 500);
  }
}

function updateGoalkeeper() {
  goalkeeper.reactionCounter++;

  if (goalkeeper.reactionCounter >= goalkeeper.reactionDelay) {
    goalkeeper.targetY = ball.y;
    goalkeeper.reactionCounter = 0;
  }

  const moveDistance = goalkeeper.targetY - goalkeeper.y;

  if (Math.abs(moveDistance) > goalkeeper.speed) {
    goalkeeper.y += Math.sign(moveDistance) * goalkeeper.speed;
  }

  goalkeeper.y = clamp(
    goalkeeper.y,
    goal.top + goalkeeper.radius,
    goal.bottom - goalkeeper.radius
  );

  const dx = ball.x - goalkeeper.x;
  const dy = ball.y - goalkeeper.y;
  const ballDistance = Math.hypot(dx, dy);
  const contactDistance = goalkeeper.radius + ball.radius;

  if (ballDistance < contactDistance && ballDistance > 0) {
    const bounceForce = 8;

    ball.dx = (dx / ballDistance) * bounceForce - 2;
    ball.dy = (dy / ballDistance) * bounceForce;

    ball.x = goalkeeper.x + (dx / ballDistance) * contactDistance;
    ball.y = goalkeeper.y + (dy / ballDistance) * contactDistance;

    message = "SAVED!";
    playSaveSound();

    setTimeout(() => {
      if (!gameOver && celebrationFrames === 0) {
        message = "";
      }
    }, 500);
  }
}

function updateBall() {
  ball.x += ball.dx;
  ball.y += ball.dy;

  ball.dx *= ball.friction;
  ball.dy *= ball.friction;

  if (Math.abs(ball.dx) < 0.04) ball.dx = 0;
  if (Math.abs(ball.dy) < 0.04) ball.dy = 0;

  if (ball.y - ball.radius < field.top) {
    ball.y = field.top + ball.radius;
    ball.dy *= -0.8;
  }

  if (ball.y + ball.radius > field.bottom) {
    ball.y = field.bottom - ball.radius;
    ball.dy *= -0.8;
  }

  if (ball.x - ball.radius < field.left) {
    ball.x = field.left + ball.radius;
    ball.dx *= -0.8;
  }

  const fullyInsideGoalOpening =
    ball.y - ball.radius > goal.top &&
    ball.y + ball.radius < goal.bottom;

  if (ball.x + ball.radius > goal.lineX && !fullyInsideGoalOpening) {
    ball.x = goal.lineX - ball.radius;
    ball.dx *= -0.8;
  }

  if (ball.x + ball.radius > field.right && !fullyInsideGoalOpening) {
    ball.x = field.right - ball.radius;
    ball.dx *= -0.8;
  }

  if (ball.x + ball.radius > goal.netX && fullyInsideGoalOpening) {
    ball.x = goal.netX - ball.radius;
    ball.dx *= -0.6;
  }

  checkGoal();
}

function checkGoal() {
  const wholeBallPastGoalLine = ball.x - ball.radius > goal.lineX;

  const wholeBallBetweenPosts =
    ball.y - ball.radius > goal.top &&
    ball.y + ball.radius < goal.bottom;

  if (
    wholeBallPastGoalLine &&
    wholeBallBetweenPosts &&
    celebrationFrames === 0
  ) {
    score++;
    celebrationFrames = 160;
    message = "GOOOOAL!";
    playGoalSound();
  }
}

function updateCelebration() {
  if (celebrationFrames <= 0) return;

  celebrationFrames--;

  if (celebrationFrames === 0) {
    message = "";
    resetPositions();
  }
}

function updateTimer(deltaTime) {
  if (celebrationFrames > 0 || gameOver) return;

  timerAccumulator += deltaTime;

  if (timerAccumulator >= 1000) {
    timeLeft--;
    timerAccumulator = 0;

    if (timeLeft <= 0) {
      timeLeft = 0;
      gameOver = true;

      if (score === 0) {
        gameResult = "LOSE";
        message = "YOU LOSE!";
      } else {
        gameResult = "WIN";
        message = "TIME'S UP!";
      }
    }
  }
}

function drawStands() {
  ctx.fillStyle = "#172135";
  ctx.fillRect(0, 0, canvas.width, field.top);

  for (let row = 0; row < 5; row++) {
    ctx.fillStyle = row % 2 === 0 ? "#263b5a" : "#314b70";
    ctx.fillRect(0, 22 + row * 25, canvas.width, 22);
  }

  const cheering = celebrationFrames > 0;
  const animationTime = Date.now() / 110;

  fans.forEach((fan) => {
    const bounce =
      Math.sin(animationTime + fan.bounceOffset) * (cheering ? 5 : 1);

    const armHeight = cheering ? 12 : 4;

    ctx.fillStyle = fan.color;
    ctx.fillRect(fan.x - 5, fan.y + bounce, 10, 12);

    ctx.beginPath();
    ctx.arc(fan.x, fan.y - 5 + bounce, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#f0b88b";
    ctx.fill();

    ctx.strokeStyle = "#f0b88b";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(fan.x - 4, fan.y + 3 + bounce);
    ctx.lineTo(fan.x - 9, fan.y - armHeight + bounce);
    ctx.moveTo(fan.x + 4, fan.y + 3 + bounce);
    ctx.lineTo(fan.x + 9, fan.y - armHeight + bounce);
    ctx.stroke();
  });

  ctx.fillStyle = "#eeeeee";
  ctx.fillRect(0, 150, canvas.width, 10);
}

function drawField() {
  ctx.fillStyle = "#299b45";
  ctx.fillRect(0, field.top, canvas.width, canvas.height - field.top);

  for (let x = 0; x < canvas.width; x += 100) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.035)";
    ctx.fillRect(x, field.top, 50, canvas.height - field.top);
  }

  ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
  ctx.lineWidth = 4;

  ctx.strokeRect(
    field.left,
    field.top + 15,
    field.right - field.left,
    field.bottom - field.top - 15
  );

  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, field.top + 15);
  ctx.lineTo(canvas.width / 2, field.bottom);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(canvas.width / 2, 455, 85, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(canvas.width / 2, 455, 5, 0, Math.PI * 2);
  ctx.fillStyle = "white";
  ctx.fill();

  ctx.strokeRect(980, 340, 200, 230);

  ctx.fillStyle = "rgba(240, 240, 240, 0.2)";
  ctx.fillRect(
    goal.lineX,
    goal.top,
    goal.netX - goal.lineX,
    goal.bottom - goal.top
  );

  ctx.strokeStyle = "white";
  ctx.lineWidth = 4;
  ctx.strokeRect(
    goal.lineX,
    goal.top,
    goal.netX - goal.lineX,
    goal.bottom - goal.top
  );

  ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
  ctx.lineWidth = 1;

  for (let x = goal.lineX + 10; x < goal.netX; x += 10) {
    ctx.beginPath();
    ctx.moveTo(x, goal.top);
    ctx.lineTo(x, goal.bottom);
    ctx.stroke();
  }

  for (let y = goal.top + 14; y < goal.bottom; y += 14) {
    ctx.beginPath();
    ctx.moveTo(goal.lineX, y);
    ctx.lineTo(goal.netX, y);
    ctx.stroke();
  }
}

function drawPlayer() {
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
  ctx.fillStyle = player.color;
  ctx.fill();

  ctx.strokeStyle = "white";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = "white";
  ctx.font = "bold 12px Arial";
  ctx.textAlign = "center";
  ctx.fillText("YOU", player.x, player.y + 4);
}

function drawDefender() {
  ctx.beginPath();
  ctx.arc(defender.x, defender.y, defender.radius, 0, Math.PI * 2);
  ctx.fillStyle = defender.color;
  ctx.fill();

  ctx.strokeStyle = "white";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = "#1d2738";
  ctx.fillRect(defender.x - 10, defender.y + 8, 20, 8);

  ctx.fillStyle = "white";
  ctx.font = "bold 10px Arial";
  ctx.textAlign = "center";
  ctx.fillText("DEF", defender.x, defender.y + 4);
}

function drawGoalkeeper() {
  ctx.beginPath();
  ctx.arc(
    goalkeeper.x,
    goalkeeper.y,
    goalkeeper.radius,
    0,
    Math.PI * 2
  );

  ctx.fillStyle = goalkeeper.color;
  ctx.fill();

  ctx.strokeStyle = "#182235";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.arc(goalkeeper.x - goalkeeper.radius, goalkeeper.y, 6, 0, Math.PI * 2);
  ctx.arc(goalkeeper.x + goalkeeper.radius, goalkeeper.y, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#172033";
  ctx.font = "bold 10px Arial";
  ctx.textAlign = "center";
  ctx.fillText("GK", goalkeeper.x, goalkeeper.y + 4);
}

function drawBall() {
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fillStyle = "white";
  ctx.fill();

  ctx.strokeStyle = "#202020";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(ball.x, ball.y, 5, 0, Math.PI * 2);
  ctx.fillStyle = "#222";
  ctx.fill();
}

function drawConfetti() {
  if (celebrationFrames <= 0) return;

  const colors = [
    "#ffdd00",
    "#f52e4d",
    "#2497ff",
    "#56dc7a",
    "#ffffff"
  ];

  for (let i = 0; i < 110; i++) {
    const x = (i * 97 + celebrationFrames * 4) % canvas.width;
    const y = 160 + ((i * 47 + celebrationFrames * 3) % 430);

    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(x, y, 6, 10);
  }
}

function drawHud() {
  ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
  ctx.fillRect(20, 185, 220, 76);

  ctx.fillStyle = "white";
  ctx.font = "bold 22px Arial";
  ctx.textAlign = "left";
  ctx.fillText(`Score: ${score}`, 36, 215);
  ctx.fillText(`Time: ${timeLeft}s`, 36, 245);

  ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
  ctx.fillRect(930, 185, 240, 42);

  ctx.fillStyle = "white";
  ctx.font = "bold 17px Arial";
  ctx.textAlign = "center";
  ctx.fillText(
    `Mode: ${difficultySelect.value.toUpperCase()}`,
    1050,
    212
  );

  if (message && !gameOver) {
    ctx.fillStyle = celebrationFrames > 0 ? "#ffe32e" : "white";
    ctx.font = "bold 50px Arial";
    ctx.textAlign = "center";
    ctx.fillText(message, canvas.width / 2, 235);
  }

  if (gameOver) {
    const lost = gameResult === "LOSE";

    ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = lost ? "#ff4b4b" : "#ffdc25";
    ctx.font = "bold 58px Arial";
    ctx.textAlign = "center";
    ctx.fillText(
      lost ? "YOU LOSE!" : "TIME'S UP!",
      canvas.width / 2,
      330
    );

    ctx.fillStyle = "white";
    ctx.font = "bold 30px Arial";
    ctx.fillText(
      lost ? "You needed at least one goal." : `Final score: ${score}`,
      canvas.width / 2,
      390
    );

    ctx.font = "21px Arial";
    ctx.fillText("Click Restart to try again", canvas.width / 2, 450);
  }
}

function gameLoop(timestamp) {
  const deltaTime = timestamp - lastTime;
  lastTime = timestamp;

  if (!gameOver) {
    if (celebrationFrames === 0) {
      updatePlayer();
      kickBall();
      updateDefender();
      updateGoalkeeper();
      updateBall();

      if (kickCooldown > 0) {
        kickCooldown--;
      }
    }

    updateCelebration();
    updateTimer(deltaTime);
  }

  drawStands();
  drawField();
  drawDefender();
  drawGoalkeeper();
  drawPlayer();
  drawBall();
  drawConfetti();
  drawHud();

  requestAnimationFrame(gameLoop);
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  keys[key] = true;

  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) {
    event.preventDefault();
  }

  initializeAudio();

  if (gameOver && key === "r") {
    resetGame();
  }
});

window.addEventListener("keyup", (event) => {
  keys[event.key.toLowerCase()] = false;
});

restartButton.addEventListener("click", () => {
  initializeAudio();
  resetGame();
});

difficultySelect.addEventListener("change", resetGame);

soundButton.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  soundButton.textContent = soundEnabled ? "🔊" : "🔇";

  soundButton.setAttribute(
    "aria-label",
    soundEnabled ? "Turn sound off" : "Turn sound on"
  );

  if (soundEnabled) {
    initializeAudio();
    playTone(500, 0.08, "sine", 0.08);
  }
});

createFans();
resetGame();
requestAnimationFrame(gameLoop);