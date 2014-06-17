var io;
var gameSocket;
var mysql = require('mysql');

/**
 * This function is called by index.js to initialize a new game instance.
 *
 * @param sio The Socket.IO library
 * @param socket The socket object for the connected client.
 */
exports.initGame = function(sio, socket){
    io = sio;
    gameSocket = socket;
    gameSocket.emit('connected', { message: "You are connected!" });

    // Host Events
    gameSocket.on('hostCreateNewGame', hostCreateNewGame);
    gameSocket.on('hostRoomFull', hostPrepareGame);
    gameSocket.on('hostCountdownFinished', hostStartGame);
    gameSocket.on('hostNextRound', hostNextRound);

    // Player Events
    gameSocket.on('playerJoinGame', playerJoinGame);
    gameSocket.on('playerCannotJoinGame', playerCannotJoinGame);
    gameSocket.on('playerAnswer', playerAnswer);
    gameSocket.on('playerRestart', playerRestart);
    gameSocket.on('playerWantToJoinGame', playerWantToJoinGame);

}

/* *******************************
   *                             *
   *       HOST FUNCTIONS        *
   *                             *
   ******************************* */

/**
 * The 'START' button was clicked and 'hostCreateNewGame' event occurred.
 */
function hostCreateNewGame() {
    var connection = mysql.createConnection({
      host     : 'sql5.freemysqlhosting.net',
      user     : 'sql543533',
      password : 'dD2!mQ5*',
      database : 'sql543533',
    });
    
    // Check connection to MySQL
    connection.connect(function(err){
        if(err){
            console.log('Error connecting to MySQL server: ' + err.code + '.');
            process.exit(1);
        }else{
            console.log('Connected to MySQL server.');
        }
    });

    // Run a test query on MySQL to make sure it works!
    connection.query('SELECT * FROM questions WHERE question_id = 1', function(err, rows, fields){
        console.log('This is a test query from MySQL:'+rows[0].question_text)
    });

    connection.end(function(err) {
        console.log('The SQL connection has been terminated')
    });

    // Create a unique Socket.IO Room
    var thisGameId = ( Math.random() * 100000 ) | 0;
    // Return the Room ID (gameId) and the socket ID (mySocketId) to the browser client
    this.emit('newGameCreated', {gameId: thisGameId, mySocketId: this.id});

    // Join the Room and wait for the players
    this.join(thisGameId.toString());
};

/*
 * Two players have joined. Alert the host!
 * @param gameId The game ID / room ID
 */
function hostPrepareGame(gameId) {
    var sock = this;
    var data = {
        mySocketId : sock.id,
        gameId : gameId
    };
    //console.log("All Players Present. Preparing game...");
    io.sockets.in(data.gameId).emit('beginNewGame', data);
}

/*
 * The Countdown has finished, and the game begins!
 * @param gameId The game ID / room ID
 */
function hostStartGame(gameId) {
    console.log('Game Started!');
    // Version using word questions
    // sendWord(0,gameId);
    sendQuestion(0,gameId);
};

/**
 * A player answered correctly. Time for the next word.
 * @param data Sent from the client. Contains the current round and gameId (room)
 */
function hostNextRound(data) {
	console.log('Asked for a new round');
    if(data.round < QuestionPool.length ){
    	console.log('Not at the end of the pool, creating a new set of words.')
        // Send a new set of questions back to the host and players.
        sendQuestion(data.round, data.gameId);
    } else {
    	console.log('End of game.')
        // If the current round exceeds the number of questions, send the 'gameOver' event.
        io.sockets.in(data.gameId).emit('gameOver',data);
    }
}


/* *****************************
   *                           *
   *     PLAYER FUNCTIONS      *
   *                           *
   ***************************** */


/**
 * Function called when a player clicked Start on his page. The goal is to verify if the username is already used.
 */

function playerWantToJoinGame(data){
    // A reference to the player's Socket.IO socket object
    var sock = this;

    // Look up the room ID in the Socket.IO manager object.
    var room = gameSocket.manager.rooms["/" + data.gameId];

    // If the room exists...
    if( room != undefined ){
      // attach the socket id to the data object.
        data.mySocketId = sock.id;

        // Join the room
        sock.join(data.gameId);

        // Emit an event notifying the clients that the player has joined the room.
        io.sockets.in(data.gameId).emit('playerAskedToJoinGame', data);

    } else {
        // Otherwise, send an error message back to the player.
        this.emit('error',{message: "This room does not exist."} );
    }

}

/**
 * A player clicked the 'START GAME' button.
 * Attempt to connect them to the room that matches
 * the gameId entered by the player.
 * @param data Contains data entered via player's input - playerName and gameId.
 */
function playerJoinGame(data) {
    //console.log('Player ' + data.playerName + 'attempting to join game: ' + data.gameId );

    // A reference to the player's Socket.IO socket object
    var sock = this;

    // Look up the room ID in the Socket.IO manager object.
    var room = gameSocket.manager.rooms["/" + data.gameId];

    // If the room exists...
    if( room != undefined ){
        // Emit an event notifying the clients that the player has joined the room.
        io.sockets.in(data.gameId).emit('playerJoinedRoom', data);

    } else {
        // Otherwise, send an error message back to the player.
        this.emit('error',{message: "This room does not exist."} );
    }
    
    
}

/**
 * Function called when a player clicked Start on his page. The goal is to verify if the username is already used.
 */

function playerCannotJoinGame(data){
    console.log('playerCannotJoinGame');
    // A reference to the player's Socket.IO socket object
    var sock = this;

    // Look up the room ID in the Socket.IO manager object.
    var room = gameSocket.manager.rooms["/" + data.gameId];

    // If the room exists...
    if( room != undefined ){
        // Emit an event notifying the clients that the player has joined the room.
        io.sockets.in(data.gameId).emit('playerDidNotJoinRoom', data);

    } else {
        // Otherwise, send an error message back to the player.
        this.emit('error',{message: "This room does not exist."} );
    }

}

/**
 * A player has tapped a word in the word list.
 * @param data gameId
 */
function playerAnswer(data) {
    console.log('Player ID: ' + data.playerId + ' answered a question with: ' + data.answer);

    // The player's answer is attached to the data object.  \
    // Emit an event with the answer so it can be checked by the 'Host'
    io.sockets.in(data.gameId).emit('hostCheckAnswer', data);
}

/**
 * The game is over, and a player has clicked a button to restart the game.
 * @param data
 */
function playerRestart(data) {
    // console.log('Player: ' + data.playerName + ' ready for new game.');

    // Emit the player's data back to the clients in the game room.
    data.playerId = this.id;
    io.sockets.in(data.gameId).emit('playerJoinedRoom',data);
}

/*
==================
TOUCHI'S QUESTIONS
==================
*/

/**
 * Send the question to the host, and a list of responses for the players.
 *
 * @param QuestionPoolIndex !WIP!
 * @param gameId The room identifier
 */
function sendQuestion(QuestionPoolIndex, gameId) {
    var data = getQuestionData(QuestionPoolIndex);
    io.sockets.in(data.gameId).emit('newQuestionData', data);
}

/*
 * This function does all the work of getting a multiple answer question from the pile
 * and organizing the data to be sent back to the clients.
 *
 * @param i The index of the QuestionPool.
 * @returns {{round: *, word: *, answer: *, list: Array}}
*/

function getQuestionData(i){
    var question = QuestionPool[i];
    question.round = i;
    return question;
}

/*
=====================================
FIND WORD WITH SAME LETTERS QUESTIONS
=====================================
*/

/*
 * Javascript implementation of Fisher-Yates shuffle algorithm
 * http://stackoverflow.com/questions/2450954/how-to-randomize-a-javascript-array
 */
function shuffle(array) {
    var currentIndex = array.length;
    var temporaryValue;
    var randomIndex;

    // While there remain elements to shuffle...
    while (0 !== currentIndex) {

        // Pick a remaining element...
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;

        // And swap it with the current element.
        temporaryValue = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = temporaryValue;
    }

    return array;
}


var QuestionObject1 = {
    id: 1,
    questionType: 'multipleChoiceSingleAnswer',
    scoringType: 'basicScoring',
    numberOfSeconds : 15,
    speedScoring: true,
    level: 'medium',
    questionText: '3 + 2 =',
    arrayOfAnswers: [{value:'1', bool: false},{value:'2', bool: false},{value:'3', bool: false},{value:'4', bool: false},{value:'5', bool: true}]
};

var QuestionObject2 = {
    id: 1,
    questionType: 'multipleChoiceSingleAnswer',
    scoringType: 'basicScoring',
    numberOfSeconds : 10,
    speedScoring: true,
    level: 'medium',
    questionText: '3 + 1 =',
    arrayOfAnswers: [{value:'1', bool: false},{value:'2', bool: false},{value:'3', bool: false},{value:'4', bool: true},{value:'5', bool: false}]
};

var QuestionObject3 = {
    id: 1,
    questionType: 'openQuestion',
    scoringType: 'openQuestionScoring',
    numberOfSeconds : 10,
    speedScoring: false,
    level: 'easy',
    questionText: "What's the capital city of France",
    arrayOfAnswers: [{value:'Paris', bool: true}]
};

var QuestionObject4 = {
    id: 1,
    questionType: 'openQuestion',
    scoringType: 'distanceScoring',
    numberOfSeconds : 10,
    speedScoring: false,
    level: 'hard',
    questionText: "What's Max's age?",
    arrayOfAnswers: [{value:'25', bool: true}]
};

var QuestionObject5 = {
    id: 1,
    questionType: 'priorityQuestion',
    scoringType: 'distanceArrayScoring',
    numberOfSeconds : 30,
    speedScoring: false,
    level: 'easy',
    questionText: "Sort those words in the alphabetical order.",
    arrayOfAnswers: [{value:'Attention', bool: true}, {value:'Blue', bool: true}, {value:'Color', bool: true}, {value:'Diamond', bool: true}, {value:'Echo', bool: true}]
};

var PausingObject = {
    questionType: 'pausingObject',
    text: 'This is the text to be displayed during the pause'
};

var QuestionPool = [QuestionObject5, PausingObject, QuestionObject4, QuestionObject3, QuestionObject2, QuestionObject1]

