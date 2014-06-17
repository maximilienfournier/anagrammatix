;
jQuery(function($){    
    'use strict';

    /**
     * All the code relevant to Socket.IO is collected in the IO namespace.
     *
     * @type {{init: Function, bindEvents: Function, onConnected: Function, onNewGameCreated: Function, playerJoinedRoom: Function, beginNewGame: Function, onNewWordData: Function, hostCheckAnswer: Function, gameOver: Function, error: Function}}
     */
    var IO = {

        /**
         * This is called when the page is displayed. It connects the Socket.IO client
         * to the Socket.IO server
         */
        init: function() {
            IO.socket = io.connect();
            IO.bindEvents();
        },

        /**
         * While connected, Socket.IO will listen to the following events emitted
         * by the Socket.IO server, then run the appropriate function.
         */
        bindEvents : function() {
            IO.socket.on('connected', IO.onConnected );
            IO.socket.on('newGameCreated', IO.onNewGameCreated );
            IO.socket.on('playerJoinedRoom', IO.playerJoinedRoom );
            IO.socket.on('playerAskedToJoinGame', IO.playerAskedToJoinGame );
            IO.socket.on('playerDidNotJoinRoom', IO.playerDidNotJoinRoom );
            IO.socket.on('beginNewGame', IO.beginNewGame );
            // IO.socket.on('newWordData', IO.onNewWordData);
            IO.socket.on('newQuestionData', IO.onNewQuestionData);
            IO.socket.on('hostCheckAnswer', IO.hostCheckAnswer);
            IO.socket.on('gameOver', IO.gameOver);
            IO.socket.on('error', IO.error );
        },

        /**
         * The client is successfully connected!
         */
        onConnected : function() {
            // Cache a copy of the client's socket.IO session ID on the App
            App.mySocketId = IO.socket.socket.sessionid;
            // console.log(data.message);
        },

        /**
         * A new game has been created and a random game ID has been generated.
         * @param data {{ gameId: int, mySocketId: * }}
         */
        onNewGameCreated : function(data) {
            App.Host.gameInit(data);
        },

        /**
         * A player has successfully joined the game.
         * @param data {{playerName: string, gameId: int, mySocketId: int}}
         */
        playerJoinedRoom : function(data) {
            // When a player joins a room, do the updateWaitingScreen function.
            // There are two versions of this function: one for the 'host' and
            // another for the 'player'.
            //
            // So on the 'host' browser window, the App.Host.updateWiatingScreen function is called.
            // And on the player's browser, App.Player.updateWaitingScreen is called.
            console.log(App.myRole);
            console.log('Called playerJoinedRoom');

            App[App.myRole].updateWaitingScreen(data);
        },

        /*
         * Function called to verify if the username is already used by another player
         */

        playerAskedToJoinGame : function(data){
            if (App.myRole === 'Host'){
                var isNameTaken = App[App.myRole].isNameTaken(data.playerName);
                console.log('Is name taken :' + isNameTaken);
                if (isNameTaken){
                    IO.socket.emit('playerCannotJoinGame', data);
                }
                else{
                    IO.socket.emit('playerJoinGame', data);
                }
            }
        },

        /*
         * Called when a player tried to join the room but the username was already taken.
         */

        playerDidNotJoinRoom : function(data){
            if (App.myRole === 'Player'){
                console.log('playerDidNotJoinRoom');
                App[App.myRole].notifyPlayerNameAlreadyTaken(data);
            }
        },

        /**
         * Both players have joined the game.
         * @param data
         */
        beginNewGame : function(data) {
            App[App.myRole].gameCountdown(data);
        },

        /**
         * A new question for the round is returned from the server.
         * @param data
         */
        onNewQuestionData : function(data) {
            console.log('onNewQuestionData ' + App.myRole);
            // Update the current round
            App.currentRound = data.round;
            console.log(data);
            if (data.questionType === 'pausingObject'){
                App[App.myRole].pausingGame(data);
            }
            else{
                // Change the word for the Host and Player
                App[App.myRole].newQuestion(data);
            }
            
        },

        /*
        // Event on NewWordData
        onNewWordData : function(data) {
            // Update the current round
            App.currentRound = data.round;

            // Change the word for the Host and Player
            App[App.myRole].newWord(data);
        },
        */


        /**
         * A player answered. If this is the host, check the answer.
         * @param data
         */
        hostCheckAnswer : function(data) {
            if(App.myRole === 'Host') {
            	console.log('data received by host.')
                App.Host.checkAnswer(data);
            }
        },

        /**
         * Let everyone know the game has ended.
         * @param data
         */
        gameOver : function(data) {
            App[App.myRole].endGame(data);
        },

        /**
         * An error has occurred.
         * @param data
         */
        error : function(data) {
            alert(data.message);
        }

    };


    var App = {

        /**
         * Keep track of the gameId, which is identical to the ID
         * of the Socket.IO Room used for the players and host to communicate
         *
         */
        gameId: 0,

        /**
         * This is used to differentiate between 'Host' and 'Player' browsers.
         */
        myRole: '',   // 'Player' or 'Host'

        /**
         * The Socket.IO socket object identifier. This is unique for
         * each player and host. It is generated when the browser initially
         * connects to the server when the page loads for the first time.
         */
        mySocketId: '',

        /**
         * Identifies the current round. Starts at 0 because it corresponds
         * to the array of word data stored on the server.
         */
        currentRound: 0,

        /* *************************************
         *                Setup                *
         * *********************************** */

        /**
         * This runs when the page initially loads.
         */
        init: function () {
            App.cacheElements();
            App.showInitScreen();
            App.bindEvents();

            // Initialize the fastclick library
            FastClick.attach(document.body);
        },

        /**
         * Create references to on-screen elements used throughout the game.
         */
        cacheElements: function () {
            App.$doc = $(document);

            // Templates
            App.$gameArea = $('#gameArea');
            App.$templateIntroScreen = $('#intro-screen-template').html();
            App.$templateNewGame = $('#create-game-template').html();
            App.$templateJoinGame = $('#join-game-template').html();
            App.$hostGame = $('#host-game-template').html();
        },

        /**
         * Create some click handlers for the various buttons that appear on-screen.
         */
        bindEvents: function () {
            // Host
            App.$doc.on('click', '#btnCreateGame', App.Host.onCreateClick);

            // Player
            App.$doc.on('click', '#btnJoinGame', App.Player.onJoinClick);
            App.$doc.on('click', '#btnStart',App.Player.onPlayerStartClick);
            App.$doc.on('click', '.btnAnswer',App.Player.onPlayerAnswerClick);
            App.$doc.on('click', '#btnPlayerRestart', App.Player.onPlayerRestart);
            App.$doc.on('click', '.btnOpenAnswer', App.Player.onPlayerAnswerClickOpenQuestion);
            App.$doc.on('click', '.btnPriorityAnswer', App.Player.onPlayerClickPriorityAnswer);
            App.$doc.on('click','.btnPriorityAnswerReset', App.Player.onPlayerClickPriorityReset);
            App.$doc.on('click','.btnPriorityAnswerSubmit', App.Player.onPlayerClickPrioritySubmit);
            App.$doc.on('click','.btnContinueGame', App.Host.endOfPause);
            
            
            
        },

        /* *************************************
         *             Game Logic              *
         * *********************************** */

        /**
         * Show the initial Anagrammatix Title Screen
         * (with Start and Join buttons)
         */
        showInitScreen: function() {
            App.$gameArea.html(App.$templateIntroScreen);
            App.doTextFit('.title');
        },


        /* *******************************
           *         HOST CODE           *
           ******************************* */
        Host : {

            /**
             * Contains references to player data
             */
            players : [],

            /**
             * Flag to indicate if a new game is starting.
             * This is used after the first game ends, and players initiate a new game
             * without refreshing the browser windows.
             */
            isNewGame : false,

            /**
             * Keep track of the number of players that have joined the game.
             */
            numPlayersInRoom: 0,

            /**
             * A reference to the correct answer for the current round.
             */
            //currentCorrectAnswer: '',
            
            /**
             * Number of current answers.
             */
             
            numberOfCurrentAnswers : 0,

			 /**
			  * Variable containing the countdown for each round
			  */
			countDownVariable : '',

             /**
              * Variable containing question data
              */

            questionData : '',

             /**
              * Time when the question has been displayed
              */

            timeBeginningQuestion : 0,

             /**
              * Number of seconds for this round
              */

            secondsForThisRound : 0,

             /**
              * Minimal and maximal amount of points a player can get 
              * For answering a question durinng a given round
              */

            minPoints : 0,
            maxPoints : 0,

            /**
             * Handler for the "Start" button on the Title Screen.
             */
            onCreateClick: function () {
                console.log('Clicked "Create A Game"');
                App.Host.numberOfPlayers = parseInt(prompt("How many players?"));
                IO.socket.emit('hostCreateNewGame');
            },

            /**
             * The Host screen is displayed for the first time.
             * @param data{{ gameId: int, mySocketId: * }}
             */
            gameInit: function (data) {
                App.gameId = data.gameId;
                App.mySocketId = data.mySocketId;
                App.myRole = 'Host';
                App.Host.numPlayersInRoom = 0;

                App.Host.displayNewGameScreen();
                // console.log("Game started with ID: " + App.gameId + ' by host: ' + App.mySocketId);
            },

            /**
             * Show the Host screen containing the game URL and unique game ID
             */
            displayNewGameScreen : function() {
                // Fill the game screen with the appropriate HTML
                App.$gameArea.html(App.$templateNewGame);

                // Display the URL on screen
                $('#gameURL').text(window.location.href);
                App.doTextFit('#gameURL');

                // Show the gameId / room id on screen
                $('#spanNewGameCode').text(App.gameId);
            },

            /**
             * Update the Host screen when the first player joins
             * @param data{{playerName: string}}
             */
            updateWaitingScreen: function(data) {
                // If this is a restarted game, show the screen.
                if ( App.Host.isNewGame ) {
                    App.Host.displayNewGameScreen();
                }
                // Update host screen
                //console.log($('#playersWaiting').append('<p/>').append('<p>'+'Player ' + data.playerName + ' joined the game.').text());
                /*$('#playersWaiting')
                    .append('<p/>')
                    .text('Player ' + data.playerName + ' joined the game.');
				*/
				
				var newTextPlayersWaiting = $('#playersWaiting').html() + '<p>'+'Player ' + data.playerName + ' joined the game.' + '</p>';
				$('#playersWaiting').html(newTextPlayersWaiting);
                
                // Store the new player's data on the Host.
                App.Host.players.push(data);

                // Increment the number of players in the room
                App.Host.numPlayersInRoom += 1;

                console.log('numPlayersInRoom in Host '+App.Host.numPlayersInRoom);

                // If all players have joined, start the game!
                if (App.Host.numPlayersInRoom ===  parseInt(App.Host.numberOfPlayers)) {
                    console.log('Room is full. Almost ready!');

                    // Let the server know that two players are present.
                    IO.socket.emit('hostRoomFull',App.gameId);
                    
                    // Initialize the attributes of the players
                    for (var i=0; i<App.Host.numPlayersInRoom; i++){
                    	App.Host.players[i].hasAlreadyAnswered = false;
                    	//App.Host.players[i].correctAnswer = false;
                        App.Host.players[i].answer = '';
                    }
                }
            },

            /**
             * Verifies is the name is already used by another player
             */
            isNameTaken : function(name){
                var result = false;
                console.log(name);
                console.log(App.Host.numPlayersInRoom);
                for(var i=0; i<App.Host.numPlayersInRoom; i++){
                    console.log(App.Host.players[i].playerName);
                    console.log((App.Host.players[i].playerName === name));
                    result = result || (App.Host.players[i].playerName === name);
                    
                }
                console.log('End of isNameTaken '+result);
                return result;
            },

            /**
             * Show the countdown screen
             */
            gameCountdown : function() {

                // Prepare the game screen with new HTML
                App.$gameArea.html(App.$hostGame);
                App.doTextFit('#hostWord');

                // Begin the on-screen countdown timer
                var $secondsLeft = $('#hostWord');
                App.countDown( $secondsLeft, 5, function(){
                    IO.socket.emit('hostCountdownFinished', App.gameId);
                });
				
				// Adding the player score area
				for (var i=0; i< App.Host.numPlayersInRoom; i++){
					//console.log($('#playerScores').html());
					var newTextPlayersScores = $('#playerScores').html() + "<div id='player"+ (i+1) +"Score' class='playerScore'> <span class='score'>0</span><span class='playerName'>Player" + (i+1) +"</span> </div>";
					//console.log(newTextPlayersScores);
					$('#playerScores').html(newTextPlayersScores);
				}
				//console.log($('#playerScores').html());
				
                // Display the players' names on screen
                for (var i=0; i< App.Host.numPlayersInRoom; i++){
                	$('#player'+(i+1)+'Score')
                    .find('.playerName')
                    .html(App.Host.players[i].playerName);
				}
				/*
				$('#player1Score')
                    .find('.playerName')
                    .html(App.Host.players[0].playerName);

                $('#player2Score')
                    .find('.playerName')
                    .html(App.Host.players[1].playerName);
                */
                    
                // Set the Score section on screen to 0 for each player.
                for (var i=0; i< App.Host.numPlayersInRoom; i++){
                	$('#player'+(i+1)+'Score').find('.score').attr('id',App.Host.players[i].mySocketId);
                }
                //$('#player1Score').find('.score').attr('id',App.Host.players[0].mySocketId);
                //$('#player2Score').find('.score').attr('id',App.Host.players[1].mySocketId);
            },
            
            /**
             * Display the countdown for each round
             */
			roundCountDown : function() {
				//App.$gameArea.html(App.$hostGame);
				//App.doTextFit('#countDownPerRound');
				
				// begin the on-screen countdown timer
				var $secondsLeftRound = $('#countDownPerRound');
				//console.log('$secondsLeftRound' + $secondsLeftRound);
				
				App.Host.countDownVariable = App.countDown($secondsLeftRound, App.Host.secondsForThisRound, App.Host.endThisRound);
				
			},
			
			
            /**
             * Show the question for the current round on screen.
             * @param data{{round: *, word: *, answer: *, list: Array}}
             */
            newQuestion : function(data) {
                console.log('newQuestion Host');
                // Insert the new word into the DOM
                //$('#hostWord').text(data.question);
                $('#hostWord').text(data.questionText);
                App.doTextFit('#hostWord');

                // Update the data for the current round
                //App.Host.currentCorrectAnswer = data.answer;
                App.Host.questionData = data;
                App.Host.currentRound = data.round;
                
                App.Host.secondsForThisRound = data.numberOfSeconds;
                App.Host.roundCountDown();
                App.Host.timeBeginningQuestion = new Date().getTime();;
                //App.Host.countDownForRound(10000);
            },

            /**
             * Function called to pause the game between sets of questions
             */

             pausingGame : function(data){
                console.log('pausingGame');
                $('#hostWord').text(data.text);
                document.getElementById('countDownPerRound').innerHTML='';
                App.doTextFit('#hostWord');
                
                var $par = $('<p/>').attr('id','pausingP');

                $par.append($('<button/>')   
                            .addClass('btn')        
                            .addClass('btnContinueGame')
                            .attr('id','btnContinueGame')
                            .val('Continue the game')          
                            .html('Continue the game')
                    )
                    
                // Insert the list onto the screen.
                $('#pausingArea').html($par);

                App.Host.questionData = data;
                App.Host.currentRound = data.round;
             },

             /**
              * Function that is called to end the pause.
              */
             endOfPause : function(){
                console.log('endOfPause');
                // Deletes the 'Continue' button displayed during the pause
                $('#pausingArea').html('');
                App.currentRound += 1;

                var data = {
                    gameId : App.gameId,
                    round : App.currentRound
                }

                // Notify the server to start the next round.
                IO.socket.emit('hostNextRound',data);

             },

            /**
             * Check the answer clicked by a player.
             * @param data{{round: *, playerId: *, answer: *, gameId: *}}
             */
            checkAnswer : function(data) {
            	console.log("Called checkAnswer");
            	
                // Verify that the answer clicked is from the current round.
                // This prevents a 'late entry' from a player whos screen has not
                // yet updated to the current round.
                if (data.round === App.currentRound){
					
					// Note which player has just answered and saves the answer
					for (var i=0; i<App.Host.numPlayersInRoom; i++){
						if (App.Host.players[i].mySocketId === data.playerId){
							App.Host.players[i].hasAlreadyAnswered = true;
                            App.Host.players[i].timeOfAnswer = data.timeOfAnswer;
                            /*
							if( App.Host.currentCorrectAnswer === data.answer) {
								App.Host.players[i].correctAnswer = true;
							}
                            */
                            App.Host.players[i].currentAnswer = data.answer;
						}
					}
					
                    var finished = true;
					
					for (var i=0; i<App.Host.numPlayersInRoom; i++){
						finished = finished && App.Host.players[i].hasAlreadyAnswered;
						console.log(App.Host.players[i]);
					}
					console.log("Finished: "+finished);
					
					if (finished){
						console.log("All participants have answered the question.");
						App.Host.endThisRound();
					}
                }
            },
			
			/**
			 * Function to be called at the end of a round
			 */
			 
			 endThisRound : function(){
			 	// Stops the timer for this round
			 	clearInterval(App.Host.countDownVariable);
			 	
			 	// Advance the round
				App.currentRound += 1;
				
               // console check
                console.log('calculate scores called');

				// Calculates scores
				App.Host.calculateScores();
				
				// Prepare data to send to the server
				var data = {
					gameId : App.gameId,
					round : App.currentRound
				}
				
				for (var i=0; i<App.Host.numPlayersInRoom; i++){
					App.Host.players[i].hasAlreadyAnswered = false;
                    delete App.Host.players[i].currentAnswer;
				}
				
				// Stops the timeout
				clearTimeout(App.Host.timeOut);
				
				// Notify the server to start the next round.
				IO.socket.emit('hostNextRound',data);
			 },
			 
			 
			/**
			 * Countdown for specific round
			 */
			 countDownForRound : function(time){
			 	App.Host.timeOut = setTimeout(App.Host.endThisRound, time);
			 },
			 
            /**
             * Determine max & min points that should be used for scoring
             * according to the level of the question
             */

            calculateMinMaxPoints : function(){
                switch (App.Host.questionData.level){
                    case 'easy':
                        App.Host.minPoints = -2.5;
                        App.Host.maxPoints = 5;
                        break;
                    case 'medium':
                        App.Host.minPoints = -5;
                        App.Host.maxPoints = 10;
                        break;
                    case 'hard':
                        App.Host.minPoints = -10;
                        App.Host.maxPoints = 20;
                        break;
                    default:
                        console.log('Question level unknown!!!');
                }
            }, 

             /**
             * Calculate the scores after the end of the round*
             */
             calculateScores : function(){
			     // Calls the appropriate scoring function for each player
                 for (var i=0; i<App.Host.numPlayersInRoom; i++){
                    var $pScore = $('#' + App.Host.players[i].mySocketId);
                    var scoreForThisRound = 0;
                    App.Host.calculateMinMaxPoints();
                    console.log('App.Host.maxPoints');
                    console.log(App.Host.maxPoints);
                    switch (App.Host.questionData.scoringType){
                        case 'basicScoring':
                            scoreForThisRound = App.Host.basicScoring(i);
                            break;
                        case 'openQuestionScoring':
                            scoreForThisRound = App.Host.openQuestionScoring(i);
                            break;
                        case 'distanceScoring':
                            console.log('distanceScoring is called')
                            scoreForThisRound = App.Host.distanceScoring(i);
                            break;
                        case 'distanceArrayScoring':
                            console.log('distanceArrayScoring');
                            scoreForThisRound = App.Host.distanceArrayScoring(i);
                            break;
                        default:
                            console.log('Scoring type unknown!!!');
                     }
                     
                     // Speed scoring calculated if specified in the question and if player has answered this question
                     if (App.Host.questionData.speedScoring){
                        console.log('Speed scoring');
                        var secondToAnswer = (App.Host.players[i].timeOfAnswer - App.Host.timeBeginningQuestion)/1000;
                        scoreForThisRound *= 1-secondToAnswer/App.Host.secondsForThisRound;
                        scoreForThisRound = Math.round(scoreForThisRound * 100) / 100
                     }
                     
                     $pScore.text( +$pScore.text() +  scoreForThisRound);
                     App.Host.players[i].answer = '';
                     App.Host.players[i].timeOfAnswer = 0;
                 }
             },

             arrayObjectIndexOf : function (myArray, searchTerm, name) {
                for(var i = 0, len = myArray.length; i < len; i++) {
                    if (myArray[i][name] === searchTerm) return i;
                }
                return -1;
            },

			/**
			 * Calculate the scores after the end of the round*
			 */
			 basicScoring : function(playerIndex){
		 		var playerAnswer = App.Host.players[playerIndex].currentAnswer;
                var index = App.Host.arrayObjectIndexOf(App.Host.questionData.arrayOfAnswers,playerAnswer, 'value');
                var scoreForThisRound = 0;
                if (index === -1){
                    // No answer from player
                    console.log('No answer from player' + playerIndex.toString());
                }
                else if (App.Host.questionData.arrayOfAnswers[index]['bool'] === true){
                    // Good answer
                    scoreForThisRound = App.Host.maxPoints;
                    
                }
                else{
                    // Wrong answer
                    scoreForThisRound = App.Host.minPoints;
                }
                return scoreForThisRound;
			 		
			 },
			 
             openQuestionScoring : function(playerIndex){
                var playerAnswer = App.Host.players[playerIndex].currentAnswer;
                var scoreForThisRound = 0;
                console.log('playerAnswer '+playerAnswer);
                
                if (typeof(playerAnswer) != 'undefined'){
                    if (playerAnswer === App.Host.questionData.arrayOfAnswers[0]['value']){
                        scoreForThisRound = App.Host.maxPoints;
                    }
                    else{
                        scoreForThisRound = App.Host.minPoints;
                    }
                }
                return scoreForThisRound;
             },

            /**
             * This scoring calculates the distance between the player's answer and the correct answer
             * and grants points according to this distance.
             */
             distanceScoring : function (playerIndex){
                var playerAnswer = App.Host.players[playerIndex].currentAnswer;
                var correctAnswer = App.Host.questionData.arrayOfAnswers[0]['value'];
                var scoreForThisRound = 0;
                var range = 0.2;
                console.log('playerAnswer '+playerAnswer); 
                // checks if the answer is not empty and is a number
                if ((typeof(playerAnswer) != 'undefined') && (parseInt(playerAnswer) != NaN)){
                    if (playerAnswer <= correctAnswer*(1+range) && playerAnswer >= correctAnswer*(1-range)){
                        // need to find an elegant way to calculate the norm, for now it's done in a basic way
                        var distance = Math.abs(correctAnswer - playerAnswer);
                        
                        // linear function to calculate the score
                        scoreForThisRound = App.Host.maxPoints - distance*(App.Host.maxPoints - App.Host.minPoints)/(correctAnswer*range)
                    }
                    else{
                        scoreForThisRound = App.Host.minPoints;
                    }
                    scoreForThisRound = Math.round(scoreForThisRound * 100) / 100
                    console.log(scoreForThisRound); 
                    
                }
                return scoreForThisRound;
             },

             /**
              * This scoring function calculates the distance between the array of answers of the player and the correct array of answers
              */


            distanceArrayScoring : function(playerIndex){
                // Those two arrays represent the position of the words in the arrayOfAnswers.
                var correctAnswer = [0,1,2,3,4];
                var playerAnswer = [];

                var playerAnswerText = App.Host.players[playerIndex].currentAnswer;
                if(typeof(playerAnswerText) != 'undefined'){
                    for (var i = 0; i < correctAnswer.length; i++) {
                        var word = App.Host.questionData.arrayOfAnswers[i]['value'];
                        playerAnswer[i] = playerAnswerText.indexOf(word);
                    }
                }
                
                var scoreForThisRound = 0;
                var maxPoints = App.Host.questionData.maxPoints;
                var minPoints = App.Host.questionData.minPoints;
                var rev = correctAnswer.slice(0).reverse();
                var distanceMax = App.distanceBetweenArrays(correctAnswer,rev);


                var range = 0.5; // Percentage of distanceMax from which the score is set to minPoints
                if((typeof(playerAnswerText) != 'undefined') && (playerAnswer.indexOf(-1) === -1)){
                    for (var i = 0; i < correctAnswer.length; i++) {
                        var word = App.Host.questionData.arrayOfAnswers[i]['value'];
                        playerAnswer[i] = playerAnswerText.indexOf(word);
                    }
                    var distance = App.distanceBetweenArrays(playerAnswer,correctAnswer);
                    if(distance < range*distanceMax){
                        scoreForThisRound = App.Host.maxPoints - distance*(App.Host.maxPoints-App.Host.minPoints)/(distanceMax*range);
                    }
                    else{
                        scoreForThisRound = App.Host.minPoints;
                    }
                    scoreForThisRound = Math.round(scoreForThisRound * 100) / 100
                }
                console.log(scoreForThisRound); 

                return scoreForThisRound;
            },

            /**
             * All 10 rounds have played out. End the game.
             * @param data
             */
            endGame : function(data) {
                // Get the data for player 1 from the host screen
                var $p1 = $('#player1Score');
                var p1Score = +$p1.find('.score').text();
                var p1Name = $p1.find('.playerName').text();

                // Get the data for player 2 from the host screen
                var $p2 = $('#player2Score');
                var p2Score = +$p2.find('.score').text();
                var p2Name = $p2.find('.playerName').text();

                // Find the winner based on the scores
                var winner = (p1Score < p2Score) ? p2Name : p1Name;
                var tie = (p1Score === p2Score);

                // Display the winner (or tie game message)
                if(tie){
                    $('#hostWord').text("It's a Tie!");
                } else {
                    $('#hostWord').text( winner + ' Wins!!' );
                }
                App.doTextFit('#hostWord');

                // Reset game data
                App.Host.numPlayersInRoom = 0;
                App.Host.isNewGame = true;
            },

            /**
             * A player hit the 'Start Again' button after the end of a game.
             */
            restartGame : function() {
                App.$gameArea.html(App.$templateNewGame);
                $('#spanNewGameCode').text(App.gameId);
            }
        },


        /* *****************************
           *        PLAYER CODE        *
           ***************************** */

        Player : {

            /**
             * A reference to the socket ID of the Host
             */
            hostSocketId: '',

            /**
             * The player's name entered on the 'Join' screen.
             */
            myName: '',

            /**
             * Player's answer for this round
             */
            answer: '',

            /**
             * Current ranking for the player in priority ranking questions
             */

            priorityAnswerCurrentRanking: 0,
			 
            /**
             * Click handler for the 'JOIN' button
             */
            onJoinClick: function () {
                // console.log('Clicked "Join A Game"');

                // Display the Join Game HTML on the player's screen.
                App.$gameArea.html(App.$templateJoinGame);
            },

            /**
             * The player entered their name and gameId (hopefully)
             * and clicked Start.
             */
            onPlayerStartClick: function() {
                // console.log('Player clicked "Start"');
                // collect data to send to the server
                var data = {
                    gameId : +($('#inputGameId').val()),
                    playerName : $('#inputPlayerName').val() || 'anon'
                };
                
                // Send the gameId and playerName to the server
                //IO.socket.emit('playerJoinGame', data);
                IO.socket.emit('playerWantToJoinGame', data);
                
                // Set the appropriate properties for the current player.
                App.myRole = 'Player';
                App.Player.myName = data.playerName;
                
            },

            /**
             *
             */
            notifyPlayerNameAlreadyTaken: function(data){
                console.log('notifyPlayerNameAlreadyTaken');
                console.log(IO.socket.socket);
                console.log(IO.socket.socket.sessionid);
                if(IO.socket.socket.sessionid === data.mySocketId){
                    console.log('notifyPlayerNameAlreadyTaken in if test.');
                    $('#playerWaitingMessage')
                        .append('<p/>')
                        .text('Username already used, please choose another one.');
                }
            },

            /**
             *  Click handler for the Player hitting a word in the word list.
             */
            onPlayerAnswerClick: function() {
                console.log('Clicked Answer Button');
                var $btn = $(this);      // the tapped button
                var answer = $btn.val(); // The tapped word
                console.log(answer);

                // Send the player info and tapped word to the server so
                // the host can check the answer.
                var data = {
                    gameId: App.gameId,
                    playerId: App.mySocketId,
                    answer: answer,
                    round: App.currentRound,
                    timeOfAnswer: new Date().getTime()
                }
                IO.socket.emit('playerAnswer',data);
            },

            onPlayerAnswerClickOpenQuestion: function() {
                console.log('Clicked Answer Button');
                
                var answer = document.getElementById("openQuestionText").value;
                // Send the player info and tapped word to the server so
                // the host can check the answer.
                var data = {
                    gameId: App.gameId,
                    playerId: App.mySocketId,
                    answer: answer,
                    round: App.currentRound,
                    timeOfAnswer: new Date().getTime()
                }
                IO.socket.emit('playerAnswer',data);
                
            },

            /**
             *  Click handler for the "Start Again" button that appears
             *  when a game is over.
             */
            onPlayerRestart : function() {
                var data = {
                    gameId : App.gameId,
                    playerName : App.Player.myName
                }
                IO.socket.emit('playerRestart',data);
                App.currentRound = 0;
                $('#gameArea').html("<h3>Waiting on host to start new game.</h3>");
            },

            /**
             * Display the waiting screen for player 1
             * @param data
             */
            updateWaitingScreen : function(data) {
                if(IO.socket.socket.sessionid === data.mySocketId){
                    App.myRole = 'Player';
                    App.gameId = data.gameId;

                    console.log('updateWaitingScreen');

                    $('#playerWaitingMessage')
                        .append('<p/>')
                        .text('Joined Game ' + data.gameId + '. Please wait for game to begin.');
                    document.getElementById("btnStart").disabled = true;
                }
            },

            /**
             * Display 'Get Ready' while the countdown timer ticks down.
             * @param hostData
             */
            gameCountdown : function(hostData) {
                App.Player.hostSocketId = hostData.mySocketId;
                $('#gameArea')
                    .html('<div class="gameOver">Get Ready!</div>');
            },

            /*
             * Function called to pause the game.
             */

            pausingGame : function(data){
                console.log('pausingGame');
                var $list = $('<ul/>').attr('id','ulAnswers');
                

                $list                                
                    .append($('<li/>') 
                        .append($('<p/>')
                            .html('Pausing game.')
                        )

                    )

                $('#gameArea').html($list);
            },

            /**
             * Show the list of words for the current round.
             * @param data{{round: *, word: *, answer: *, list: Array}}
             */
            newQuestion : function(data) {
                console.log('Player newQuestion called');
                console.log(data.questionType);
                App.Player.priorityAnswerCurrentRanking = 0;

                // Switch to display the appropriate items on the player's screen
                switch(data.questionType){
                    case 'multipleChoiceSingleAnswer':
                        App.Player.newQuestionMultipleChoice(data);
                        break;
                    case 'multipleChoiceMultipleAnswer':
                        App.Player.newQuestionMultipleChoice(data);
                        break;
                    case 'openQuestion':
                        App.Player.newQuestionOpenQuestion(data);
                        break;
                    case 'priorityQuestion':
                        App.Player.newQuestionPriorityQuestion(data);
                        break;
                    default:
                        console.log("The question type is not known for the player's display");
                }

                
            },

            newQuestionMultipleChoice : function(data){
                console.log('Called newQuestionMultipleChoice');
                console.log(data.arrayOfAnswers);
                // Create an unordered list element
                var $list = $('<ul/>').attr('id','ulAnswers');

                // Insert a list item for each word in the word list
                // received from the server.

                //$.each(data.list, function(){
                $.each(data.arrayOfAnswers, function(){
                    $list                                //  <ul> </ul>
                        .append( $('<li/>')              //  <ul> <li> </li> </ul>
                            .append( $('<button/>')      //  <ul> <li> <button> </button> </li> </ul>
                                .addClass('btnAnswer')   //  <ul> <li> <button class='btnAnswer'> </button> </li> </ul>
                                .addClass('btn')         //  <ul> <li> <button class='btnAnswer'> </button> </li> </ul>
                                .val(this['value'])               //  <ul> <li> <button class='btnAnswer' value='word'> </button> </li> </ul>
                                .html(this['value'])              //  <ul> <li> <button class='btnAnswer' value='word'>word</button> </li> </ul>
                            )
                        )
                });

                // Insert the list onto the screen.
                $('#gameArea').html($list);
            },

            newQuestionOpenQuestion : function(data){
                var $list = $('<ul/>').attr('id','ulAnswers');

                // Insert a list item for each word in the word list
                // received from the server.
                
                $list                                //  <ul> </ul>
                    .append($('<li/>') 
                        .append($('<input/>')
                            .attr('type', 'text')
                            .attr('id','openQuestionText')
                        )

                    )
                    .append( $('<li/>')              //  <ul> <li> </li> </ul>
                        .append( $('<button/>')      //  <ul> <li> <button> </button> </li> </ul>
                            .addClass('btnOpenAnswer')   //  <ul> <li> <button class='btnOpenAnswer'> </button> </li> </ul>
                            .addClass('btn')         //  <ul> <li> <button class='btnOpenAnswer'> </button> </li> </ul>
                            .val('submit')               //  <ul> <li> <button class='btnOpenAnswer' value='submit'> </button> </li> </ul>
                            .html('Submit')              //  <ul> <li> <button class='btnOpenAnswer' value='submit'>Submit</button> </li> </ul>
                        )
                    )
            

                // Insert the list onto the screen.
                $('#gameArea').html($list);
            },

            newQuestionPriorityQuestion : function(data){
                var answersShuffled = App.shuffle(data.arrayOfAnswers);
                var $list = $('<ul/>').attr('id','ulAnswers');

                $.each(data.arrayOfAnswers, function(){
                    $list                                //  <ul> </ul>
                        .append( $('<li/>')              //  <ul> <li> </li> </ul>
                            .append( $('<button/>')      //  <ul> <li> <button> </button> </li> </ul>
                                .addClass('btnPriorityAnswer')   //  <ul> <li> <button class='btnPriorityAnswerNumber'> </button> </li> </ul>
                                .addClass('btn')         //  <ul> <li> <button class='btnPriorityAnswerNumber'> </button> </li> </ul>
                                .val(this['value'])               //  <ul> <li> <button class='btnPriorityAnswerNumber' value='word'> </button> </li> </ul>
                                .html(this['value'])              //  <ul> <li> <button class='btnPriorityAnswerNumber' value='word'>word</button> </li> </ul>
                            )
                            .append( $('<button/>')      //  <ul> <li> <button> </button> </li> </ul>
                                .addClass('btnPriorityAnswerNumber')   //  <ul> <li> <button class='btnPriorityAnswerNumber'> </button> </li> </ul>
                                .addClass('btn')         //  <ul> <li> <button class='btnPriorityAnswerNumber'> </button> </li> </ul>
                                //.val(this['value'])               //  <ul> <li> <button class='btnPriorityAnswerNumber' value='word'> </button> </li> </ul>
                                .attr('id',this['value'])
                            )
                        )
                });
                
                $list
                    .append($('<li/>')
                        .append($('<button/>')
                            .addClass('btnPriorityAnswerSubmit')   //  <ul> <li> <button class='btnPriorityAnswerSubmit'> </button> </li> </ul>
                            .addClass('btn')         //  <ul> <li> <button class='btnPriorityAnswerSubmit'> </button> </li> </ul>
                            .val('Submit')               //  <ul> <li> <button class='btnPriorityAnswerSubmit' value='Reset'> </button> </li> </ul>
                            .html('Submit')
                        )
                        .append($('<button/>')
                            .addClass('btnPriorityAnswerReset')   //  <ul> <li> <button class='btnPriorityAnswerSubmit'> </button> </li> </ul>
                            .addClass('btn')         //  <ul> <li> <button class='btnPriorityAnswerSubmit'> </button> </li> </ul>
                            .val('Reset')               //  <ul> <li> <button class='btnPriorityAnswerSubmit' value='Reset'> </button> </li> </ul>
                            .html('Reset')
                        )
                    )

                

                // Insert the list onto the screen.
                $('#gameArea').html($list);

            },

            /** 
             * Function that modifies the display of the ranking when a priority button is clicked
            */
            onPlayerClickPriorityAnswer : function(){
                console.log('Button clicked.')
                var $btn = $(this);      // the tapped button
                var word = $btn.val();

                if (App.Player.priorityAnswerCurrentRanking === 0){
                    App.Player.onPlayerClickPriorityReset();
                }
                // Verify if the button has not already been clicked
                document.getElementById(word).innerHTML
                if ((App.Player.priorityAnswerCurrentRanking < 5) && (document.getElementById(word).innerHTML === '')){
                    App.Player.priorityAnswerCurrentRanking += 1;
                    document.getElementById(word).innerHTML = App.Player.priorityAnswerCurrentRanking;
                }

            },

            /** 
             * Function that reset the priority ranking answers when reset button is clicked
             */

            onPlayerClickPriorityReset : function(){
                App.Player.priorityAnswerCurrentRanking = 0;
                var elems = document.getElementsByTagName('*'), i;
                for (i in elems) {
                    if((' ' + elems[i].className + ' ').indexOf(' ' + 'btnPriorityAnswerNumber' + ' ')
                            > -1) {
                        elems[i].innerHTML = '';
                    }
                }
            },

            /** 
             * Function that submit the priority ranking answers when submit button is clicked
             */

            onPlayerClickPrioritySubmit : function(){
                App.Player.priorityAnswerCurrentRanking = 0;
                console.log('Submit button clicked');
                
                var answer = [];
                var elems = document.getElementsByTagName('*'), i;
                for (i in elems) {
                    if((' ' + elems[i].className + ' ').indexOf(' ' + 'btnPriorityAnswerNumber' + ' ')
                            > -1) {
                        answer[parseInt(elems[i].innerHTML)-1] = elems[i].id;
                    }
                }

                // Send the player info and tapped word to the server so
                // the host can check the answer.
                var data = {
                    gameId: App.gameId,
                    playerId: App.mySocketId,
                    answer: answer,
                    round: App.currentRound,
                    timeOfAnswer: new Date().getTime()
                }
                console.log(answer);
                IO.socket.emit('playerAnswer',data);
            },

            /**
             * Show the "Game Over" screen.
             */
            endGame : function() {
                $('#gameArea')
                    .html('<div class="gameOver">Game Over!</div>')
                    .append(
                        // Create a button to start a new game.
                        $('<button>Start Again</button>')
                            .attr('id','btnPlayerRestart')
                            .addClass('btn')
                            .addClass('btnGameOver')
                    );
            }
        },


        /* **************************
                  UTILITY CODE
           ************************** */

        /**
         * Display the countdown timer on the Host screen
         *
         * @param $el The container element for the countdown timer
         * @param startTime
         * @param callback The function to call when the timer ends.
         */
        countDown : function( $el, startTime, callback) {
			
			//console.log("$el", $el);
			//console.log("$el[selector]",$el['selector']);
			
            // Display the starting time on the screen.
            $el.text(startTime);
            //App.doTextFit('#hostWord');
            if ($el['selector']!=='#countDownPerRound'){
            	App.doTextFit($el['selector']);
			}
            // console.log('Starting Countdown...');

            // Start a 1 second timer
            var timer = setInterval(countItDown,1000);

            // Decrement the displayed timer value on each 'tick'
            function countItDown(){
                startTime -= 1
                $el.text(startTime);
                //App.doTextFit('#hostWord');
                if ($el['selector']!=='#countDownPerRound'){
                	App.doTextFit($el['selector']);
                }

                if( startTime <= 0 ){
                    // console.log('Countdown Finished.');

                    // Stop the timer and do the callback.
                    clearInterval(timer);
                    callback();
                    return;
                }
            }
			return timer
        },

        /**
         * Function that shuffles an array
         */
        shuffle: function(o){
            for(var j, x, i = o.length; i; j = Math.floor(Math.random() * i), x = o[--i], o[i] = o[j], o[j] = x);
            return o;
        },

        /**
         * Function that calculates the distance between two arrays
         */

        distanceBetweenArrays : function(a,b){
            var distance = 0;
            for(var i=0; i<a.length; i++){
                distance += Math.pow(a[i]-b[i],2);
            }
            return Math.sqrt(distance);
        },

        /**
         * Make the text inside the given element as big as possible
         * See: https://github.com/STRML/textFit
         *
         * @param el The parent element of some text
         */
        doTextFit : function(el) {
            textFit(
                $(el)[0],
                {
                    alignHoriz:true,
                    alignVert:false,
                    widthOnly:true,
                    reProcess:true,
                    maxFontSize:300
                }
            );
        }

    };

    IO.init();
    App.init();

}($));
