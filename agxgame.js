var io;
var gameSocket;
var mysql = require('mysql');
var QuestionPoolDB = [];
var queries = [];

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
    gameSocket.on('hostDisplayAnswer', playersDisplayAnswer);

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
function hostCreateNewGame(setupOfGame) {
    var connectionTest = mysql.createConnection({
      host     : 'us-cdbr-east-06.cleardb.net',
      user     : 'bf83dd12049197',
      password : '9f757d98',
      database : 'heroku_109e318ba266730',
    });
    // Create a unique Socket.IO Room
    var thisGameId = ( Math.random() * 100000 ) | 0;
    // Verifies that the gameId is not already used
    while(QuestionPoolDB[thisGameId] != undefined){
        thisGameId = ( Math.random() * 100000 ) | 0;
    }
    QuestionPoolDB[thisGameId]= [];

    // Check connection to MySQL
    connectionTest.connect(function(err){
        if(err){
            console.log('Error connecting to MySQL server: ' + err.code + '.');
            // The followinf line should not be used otherwise it kills the server when no internet connection is available
            //process.exit(1);
        }else{
            console.log('Connected to MySQL server.');
            // Run a test query on MySQL to make sure it works!

            connectionTest.end(function(err) {
                console.log('The SQL connection has been terminated in test');
            });
              
        }
    });

    createSetOfQuestionFromDB(setupOfGame, thisGameId); 
    
    // Return the Room ID (gameId) and the socket ID (mySocketId) to the browser client
    this.emit('newGameCreated', {gameId: thisGameId, mySocketId: this.id});

    // Join the Room and wait for the players
    this.join(thisGameId.toString());
    
};

/* 
 * Creates a set of question from DB
 */

function createSetOfQuestionFromDB(setupOfGame, gameId){
    /*var connection = mysql.createConnection({
      host     : 'us-cdbr-east-06.cleardb.net',
      user     : 'bf83dd12049197',
      password : '9f757d98',
      database : 'heroku_109e318ba266730',
    });
    */
    //var QuestionPoolDB = [];

    // Reset the queries array
    queries = [];

    // Building the QuestionPoolDB
    // Create queries
    for(var j = 0; j<setupOfGame.length; j++){
        queries[j] = buildSqlQuery(setupOfGame[j]);
    }
    console.log(queries);

    createQuestionPoolDBRound(setupOfGame, gameId, 0);

};

/*
 * Creates the question pool for the round "index"
 */
function createQuestionPoolDBRound(setupOfGame, gameId, index){
    console.log('createQuestionPoolDBRound '+ index);
    console.log(queries[index]);
    
    var connection = mysql.createConnection({
      host     : 'us-cdbr-east-06.cleardb.net',
      user     : 'bf83dd12049197',
      password : '9f757d98',
      database : 'heroku_109e318ba266730',
    });
    
    connection.query(queries[index], function(err, rows, fields){
        // Number of questions in the round, dealing with the case when not enough questions to create the round
        // That could be enhanced by selecting questions that are related to the wanted criterias
        if (rows != undefined){
            console.log("setupOfGame " + setupOfGame[index]);
            //console.log(rows);
            console.log('setupOfGame.numberOfQuestions '+ setupOfGame[index].numberOfQuestions);
            console.log('setupOfGame.difficulty '+ setupOfGame[index].difficulty);
            console.log('setupOfGame.tag '+ setupOfGame[index].tag);
            console.log('setupOfGame.questionType '+ setupOfGame[index].questionType);
            console.log('setupOfGame.speedScoring '+ setupOfGame[index].speedScoring);

            setupOfGame[index].numberOfQuestions = Math.min(parseInt(setupOfGame[index].numberOfQuestions), rows.length);
            console.log('Actual number of questions: '+setupOfGame[index].numberOfQuestions);

            // Generating random indexes to pick up random questions from the one selected in the DB
            var arr = []
            while(arr.length < setupOfGame[index].numberOfQuestions){
              var randomNumber=Math.round(Math.random()*(rows.length-1))
              var found=false;
              for(var i=0;i<arr.length;i++){
                if(arr[i]==randomNumber){
                    found=true;
                    break
                }
              }
              if(!found)arr[arr.length]=randomNumber;
            }

            // Screen to announce the properties of the round
            var RoundPresentation = {
                questionType: 'roundPresentation',
                roundIndex: index + 1,
                setupOfGame: setupOfGame[index]
            };

            QuestionPoolDB[gameId].push(RoundPresentation);

            // Creates the questions and add them to the QuestionPoolDB object
            for(var i = 0; i<setupOfGame[index].numberOfQuestions;i++){
                var question = createQuestionObject(rows[arr[i]]);
                // Adding speed scoring if necessary
                if (setupOfGame[index].speedScoring === true){
                    question.speedScoring = true;
                }
                else{
                    question.speedScoring = false;
                }
                //console.log(question);
                QuestionPoolDB[gameId].push(question);
            }

            // Adding a pause between each round
            if (index < setupOfGame.length-1){
                var nextRound = index + 2;
                var PausingObject = {
                    questionType: 'pausingObject'
                };
                QuestionPoolDB[gameId].push(PausingObject);
            }
            
            connection.end(function(err) {
                console.log('The SQL connection has been terminated');
            });

            if(index < queries.length-1){
                createQuestionPoolDBRound(setupOfGame, gameId, index+1);
            }
        
        }
    });
        
    
    
    
};
 
/*
 * Creates the SQL query from the array of properties
 */
 function buildSqlQuery(properties){
    var sqlQuery = 'SELECT * FROM questions';
    var added= false;

    // Adding the tag
    if (properties.tag != 'random'){
        added = true;
        sqlQuery += " WHERE tags LIKE '%" + properties.tag + "%'";
    }

    // Adding the question type
    if (properties.questionType != 'random'){
        if (!added){
            sqlQuery += ' WHERE';
        }
        else{
            sqlQuery += ' AND';
        }
        sqlQuery += " question_type = '" + properties.questionType +"'";
    }

    // Adding the difficulty
    if(properties.difficulty != 'mix'){
        if (!added){
            sqlQuery += ' WHERE';
        }
        else{
            sqlQuery += ' AND';
        }
        sqlQuery += " difficulty = '" + properties.difficulty +"'";
    }

    return sqlQuery;
 };
/*
 * Creates a question object from a row of DB
 */

 function createQuestionObject(row){
    var QuestionObject = {
        id: row.question_id,
        questionType: row.question_type,
        scoringType: row.scoring_type,
        numberOfSeconds : row.number_of_seconds,
        speedScoring: row.speed_scoring,
        level: row.difficulty,
        questionText: row.question_text,
        arrayOfAnswers: [{value: row.answer1_text, bool: (row.answer1_correct==1)}, 
                         {value: row.answer2_text, bool: (row.answer2_correct==1)}, 
                         {value: row.answer3_text, bool: (row.answer3_correct==1)}, 
                         {value: row.answer4_text, bool: (row.answer4_correct==1)}, 
                         {value: row.answer5_text, bool: (row.answer5_correct==1)}]
    };
    //console.log(QuestionObject.arrayOfAnswers);
    return QuestionObject;
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

    if (QuestionPoolDB[data.gameId].length === 0){
        // No connection to the DB
        var limit = QuestionPool.length;
    }
    else{
        var limit = QuestionPoolDB[data.gameId].length;
    }
    if(data.round < limit ){
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
 * Function called to display the correct answer on the players' screens
 */
function playersDisplayAnswer(data){
    console.log('playersDisplayAnswer');
    io.sockets.in(data.gameId).emit('playersDisplayAnswer', data);
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
    var data = clone(getQuestionData(QuestionPoolIndex, gameId));
    if (data.questionType === 'priorityQuestion'){
        console.log('arrayOfAnswers at beginning');
        for(var i=0;i<data.arrayOfAnswers.length;i++){
            console.log(data.arrayOfAnswers[i]['value']);
        }
        var tempArray = data.arrayOfAnswers.slice(0);
        data.correctOrderArrayOfAnswers = tempArray;
        data.arrayOfAnswers = shuffle(data.arrayOfAnswers);
        for(var i=0;i<data.correctOrderArrayOfAnswers.length;i++){
            console.log(data.correctOrderArrayOfAnswers[i]['value']);
        }
        console.log('arrayOfAnswers');
        for(var i=0;i<data.arrayOfAnswers.length;i++){
            console.log(data.arrayOfAnswers[i]['value']);
        }
    }
    io.sockets.in(data.gameId).emit('newQuestionData', data);
}

function clone(obj) {
    if (null == obj || "object" != typeof obj) return obj;
    var copy = obj.constructor();
    for (var attr in obj) {
        if (obj.hasOwnProperty(attr)) copy[attr] = obj[attr];
    }
    return copy;
}
   
 /**
 * Function that shuffles an array
 */
function shuffle(o){
    var o = o.slice();
    for(var j, x, i = o.length; i; j = Math.floor(Math.random() * i), x = o[--i], o[i] = o[j], o[j] = x);
    return o;
}

/*
 * This function does all the work of getting a multiple answer question from the pile
 * and organizing the data to be sent back to the clients.
 *
 * @param i The index of the QuestionPool.
 * @returns {{round: *, word: *, answer: *, list: Array}}
*/

function getQuestionData(i, gameId){
    if (QuestionPoolDB[gameId].length === 0){
        // No connection to the DB, using the hard coded questions
        var question = QuestionPool[i];
    }
    else{
        var question = QuestionPoolDB[gameId][i];
    }    
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
 /*
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
*/


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

var QuestionPool = [QuestionObject2, QuestionObject5, PausingObject, QuestionObject4, QuestionObject3, QuestionObject1]

