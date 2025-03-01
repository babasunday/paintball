// Paintball Shooter Multiplayer - Web Version
// Using HTML, JavaScript (Phaser.js), and Firebase

// Firebase Configuration
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getDatabase, ref, set, onValue, push, remove } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

// Move this to a separate config file in production
const firebaseConfig = {
    apiKey: "AIzaSyB7VStMWWNn5fnutXUMUaKLYBs6raeMDL0",
    authDomain: "paintball-7f21e.firebaseapp.com",
    databaseURL: "https://paintball-7f21e-default-rtdb.firebaseio.com",
    projectId: "paintball-7f21e",
    storageBucket: "paintball-7f21e.appspot.com",
    messagingSenderId: "379324579178",
    appId: "1:379324579178:web:21ea89508c0339e37a7913",
    measurementId: "G-HER6F5MNS9"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Check if device is mobile
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

// Game Setup
const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    physics: { 
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    scale: {
        mode: Phaser.Scale.RESIZE,
        parent: 'game',
        width: '100%',
        height: '100%',
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: { preload, create, update }
};

const game = new Phaser.Game(config);
let player, cursors, bullets, enemies;
let leftButton, rightButton, shootButton;
let playerName = prompt("Enter your initials:") || "Player";
let score = 0;
let scoreText;
let isMovingLeft = false;
let isMovingRight = false;
let lastShootTime = 0;
const SHOOT_DELAY = 250; // Minimum time between shots in milliseconds

let playersRef = ref(db, "players");
let bulletsRef = ref(db, "bullets");
let enemiesRef = ref(db, "enemies");

let scene; // Add this at the top with other global variables

function preload() {
    // Add error handling for image loading
    this.load.on('loaderror', function(file) {
        console.error('Error loading file:', file.src);
    });

    // Add success logging
    this.load.on('filecomplete', function(key, type, data) {
        console.log('Successfully loaded:', key);
    });

    // Try loading images with both paths
    try {
        // First try with assets/ prefix
        this.load.image('player', './assets/player.png');
        this.load.image('bullet', './assets/bullet.png');
        this.load.image('enemy', './assets/enemy.png');
        this.load.image('left', './assets/left.png');
        this.load.image('right', './assets/right.png');
        this.load.image('shoot', './assets/shoot.png');
    } catch (error) {
        console.error('Error in preload:', error);
        // Fallback to root directory if assets/ fails
        try {
            this.load.image('player', 'player.png');
            this.load.image('bullet', 'bullet.png');
            this.load.image('enemy', 'enemy.png');
            this.load.image('left', 'left.png');
            this.load.image('right', 'right.png');
            this.load.image('shoot', 'shoot.png');
        } catch (fallbackError) {
            console.error('Error in preload fallback:', fallbackError);
        }
    }
}

function create() {
    scene = this; // Store the scene reference
    this.cameras.main.setBackgroundColor('#000000');
    
    // Add error checking for sprite creation
    try {
        // Make score text responsive
        const textScale = Math.min(window.innerWidth, window.innerHeight) * 0.03;
        scoreText = this.add.text(20, 20, `Score: ${score}`, { 
            font: `${textScale}px Arial`, 
            fill: "#fff" 
        });

        // Log the actual dimensions we're working with
        console.log('Game dimensions:', config.width, config.height);

        player = this.physics.add.sprite(config.width / 2, config.height - 50, 'player');
        if (!player) {
            console.error('Failed to create player sprite');
            return;
        }
        
        player.setCollideWorldBounds(true);
        
        // Scale player based on screen size
        const playerScale = Math.min(window.innerWidth, window.innerHeight) * 0.0008;
        player.setScale(playerScale);

        // Log player properties
        console.log('Player position:', player.x, player.y);
        console.log('Player scale:', playerScale);

        cursors = this.input.keyboard.createCursorKeys();
        bullets = this.physics.add.group();
        enemies = this.physics.add.group();

        if (isMobile) {
            setupMobileControls(this);
        }

        // Spawn enemies
        spawnEnemies();

        // Collision detection
        this.physics.add.collider(bullets, enemies, bulletHitEnemy, null, this);

        // Modify the Firebase listeners to bind 'this'
        set(ref(db, `players/${playerName}`), { x: player.x, score: score });
        onValue(playersRef, (snapshot) => updatePlayers.call(this, snapshot.val()));
        onValue(bulletsRef, (snapshot) => updateBullets.call(this, snapshot.val()));
        onValue(enemiesRef, (snapshot) => updateEnemies.call(this, snapshot.val()));

    } catch (error) {
        console.error('Error in create:', error);
    }
}

function setupMobileControls(scene) {
    // Calculate button sizes and positions based on screen size
    const buttonScale = Math.min(window.innerWidth, window.innerHeight) * 0.0015;
    const buttonY = window.innerHeight * 0.85;
    
    // Create semi-transparent background for controls
    const controlBg = scene.add.rectangle(0, window.innerHeight * 0.8, window.innerWidth, window.innerHeight * 0.2, 0x000000, 0.3);
    controlBg.setOrigin(0, 0);

    // Movement controls on left side
    leftButton = scene.add.image(window.innerWidth * 0.1, buttonY, 'left')
        .setInteractive()
        .setScale(buttonScale)
        .setAlpha(0.7);
    
    rightButton = scene.add.image(window.innerWidth * 0.25, buttonY, 'right')
        .setInteractive()
        .setScale(buttonScale)
        .setAlpha(0.7);

    // Shoot button on right side
    shootButton = scene.add.image(window.innerWidth * 0.85, buttonY, 'shoot')
        .setInteractive()
        .setScale(buttonScale)
        .setAlpha(0.7);

    // Touch controls with visual feedback
    leftButton.on('pointerdown', () => {
        isMovingLeft = true;
        leftButton.setAlpha(1);
    });
    leftButton.on('pointerup', () => {
        isMovingLeft = false;
        leftButton.setAlpha(0.7);
        player.setVelocityX(0);
    });
    leftButton.on('pointerout', () => {
        isMovingLeft = false;
        leftButton.setAlpha(0.7);
        player.setVelocityX(0);
    });

    rightButton.on('pointerdown', () => {
        isMovingRight = true;
        rightButton.setAlpha(1);
    });
    rightButton.on('pointerup', () => {
        isMovingRight = false;
        rightButton.setAlpha(0.7);
        player.setVelocityX(0);
    });
    rightButton.on('pointerout', () => {
        isMovingRight = false;
        rightButton.setAlpha(0.7);
        player.setVelocityX(0);
    });

    shootButton.on('pointerdown', () => {
        shootButton.setAlpha(1);
        shoot();
    });
    shootButton.on('pointerup', () => {
        shootButton.setAlpha(0.7);
    });
    shootButton.on('pointerout', () => {
        shootButton.setAlpha(0.7);
    });
}

function update() {
    const currentTime = Date.now();

    // Handle movement
    if (cursors.left.isDown || isMovingLeft) {
        movePlayer(-1);
    } else if (cursors.right.isDown || isMovingRight) {
        movePlayer(1);
    } else if (!isMovingLeft && !isMovingRight) {
        player.setVelocityX(0);
    }
    
    // Handle shooting with delay
    if (Phaser.Input.Keyboard.JustDown(cursors.space) && currentTime - lastShootTime >= SHOOT_DELAY) {
        shoot();
        lastShootTime = currentTime;
    }

    // Clean up bullets that are out of bounds
    bullets.children.iterate(bullet => {
        if (bullet && (bullet.y < 0 || bullet.y > config.height)) {
            bullet.destroy();
        }
    });

    // Update player position in Firebase
    set(ref(db, `players/${playerName}`), { x: player.x, score: score });
}

function spawnEnemies() {
    enemies.clear(true, true);
    for (let i = 0; i < 5; i++) {
        let enemy = enemies.create(
            Phaser.Math.Between(50, config.width - 50),
            Phaser.Math.Between(50, config.height * 0.4),
            'enemy'
        );
        enemy.setCollideWorldBounds(true);
        enemy.setBounce(1);
        enemy.setVelocity(
            Phaser.Math.Between(-100, 100),
            Phaser.Math.Between(50, 150)
        );
    }
}

function bulletHitEnemy(bullet, enemy) {
    bullet.destroy();
    enemy.destroy();
    score += 10;
    scoreText.setText(`Score: ${score}`);
    
    if (enemies.countActive() === 0) {
        spawnEnemies();
    }
}

function movePlayer(direction) {
    player.setVelocityX(direction * 300);
}

function shoot() {
    let bullet = bullets.create(player.x, player.y - 20, 'bullet');
    bullet.setVelocityY(-400);
    push(bulletsRef, { x: player.x, y: player.y, playerId: playerName });
}

function updatePlayers(players) {
    if (!players || !this.children) return;
    
    try {
        Object.entries(players).forEach(([id, data]) => {
            if (id !== playerName) {
                let otherPlayer = this.children.getByName(`player_${id}`);
                if (!otherPlayer) {
                    otherPlayer = this.add.sprite(data.x, config.height - 50, 'player');
                    otherPlayer.name = `player_${id}`;
                    otherPlayer.setTint(0x00ff00);
                } else {
                    otherPlayer.x = data.x;
                }
            }
        });
    } catch (error) {
        console.error('Error updating players:', error);
    }
}

function updateBullets(bulletsData) {
    if (!bulletsData || !scene) return;
    try {
        Object.entries(bulletsData).forEach(([key, data]) => {
            if (data.playerId !== playerName) {
                bullets.create(data.x, data.y, 'bullet').setVelocityY(-400);
                remove(ref(db, `bullets/${key}`));
            }
        });
    } catch (error) {
        console.error('Error updating bullets:', error);
    }
}

function updateEnemies(enemiesData) {
    if (!enemiesData || !scene) return;
    try {
        enemies.clear(true, true);
        Object.entries(enemiesData).forEach(([key, data]) => {
            let enemy = enemies.create(data.x, data.y, 'enemy');
            enemy.setVelocity(data.velocityX, data.velocityY);
        });
    } catch (error) {
        console.error('Error updating enemies:', error);
    }
}

// Handle orientation change
window.addEventListener('orientationchange', () => {
    setTimeout(() => {
        game.scale.resize(window.innerWidth, window.innerHeight);
        if (scoreText) {
            const textScale = Math.min(window.innerWidth, window.innerHeight) * 0.03;
            scoreText.setFontSize(`${textScale}px`);
        }
    }, 100);
});

