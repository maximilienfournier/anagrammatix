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
            IO.socket.on('playersDisplayAnswer', IO.onplayersDisplayAnswer);
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
                // Pause the game at the end of the round
                App[App.myRole].pausingGame(data);
            }
            else if (data.questionType === 'roundPresentation'){
                // Display the screen to present the round's properties
                App[App.myRole].roundPresentation(data);
            }
            else{
                console.log('correctOrderArrayOfAnswers in IO');
                console.log(data.correctOrderArrayOfAnswers);
                // Sending the question to the Host and the player
                App[App.myRole].newQuestion(data);
            }
            
        },

        /**
         * Called at the end of the round to display the correct answer and update the score
         */

        onplayersDisplayAnswer : function(data){            
            console.log('onHostDisplayAnswer');
            if(App.myRole === 'Player') {
                if (data.questionType === 'multipleChoiceSingleAnswer' || data.questionType === 'priorityQuestion'){
                    var nbSeconds = 5000;
                }
                else{
                    var nbSeconds = 10;
                }
                setTimeout(function(){console.log('Calling updatePlayerScore');
                App.Player.updatePlayerScore(data);}
                ,nbSeconds)
            }
            App[App.myRole].displayCorrectAnswer(data);
        },


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
            App.$templateplayerGame = $('#player-game-template').html();
            App.$templateSetupNewGame = $('#setup-game-template').html();
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
            App.$doc.on('click', '#btnGenerateGame', App.Host.generateNewGame);
            App.$doc.on('click', '.btnAnswer',App.Player.onPlayerAnswerClick);
            App.$doc.on('click', '#btnPlayerRestart', App.Player.onPlayerRestart);
            App.$doc.on('click', '.btnOpenAnswer', App.Player.onPlayerAnswerClickOpenQuestion);
            App.$doc.on('click', '.btnPriorityAnswer', App.Player.onPlayerClickPriorityAnswer);
            App.$doc.on('click','.btnPriorityAnswerReset', App.Player.onPlayerClickPriorityReset);
            App.$doc.on('click','.btnPriorityAnswerSubmit', App.Player.onPlayerClickPrioritySubmit);
            App.$doc.on('click','.btnContinueGame', App.Host.endOfPause);
            App.$doc.on('click','.btnBeginRound', App.Host.endOfRoundPresentation);
            App.$doc.on('click','#addRound', App.Host.addRound);
            App.$doc.on('click','#deleteRound', App.Host.deleteRound);
            
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

            /*
             * Number of rounds in the set up page
             */
            numberOfRounds :0,

            /*
             * 
             */
            currentRoundNumber : 0,
            questionNumberInCurrentRound: 0,
            totalNumberOfQuestionsInCurrentRound:0,

            /**
             * Handler for the "Start" button on the Title Screen.
             */
            onCreateClick: function () {
                console.log('Clicked "Create A Game"');
                /*
                var number = prompt("How many players?");
                var isNotNumber = isNaN(number);
                while(isNotNumber){
                    number = prompt("You did not choose a correct number. How many players?");
                    isNotNumber = isNaN(number);
                }
                //App.Host.numberOfPlayers = parseInt(number);
                */
                App.$gameArea.html(App.$templateSetupNewGame);

                var $text  = $('<div/>');
                $text.append($('<div/>').html('').addClass('addColumn'));
                $text.append($('<div/>').html('').addClass('roundColumn'));
                $text.append($('<div/>').html('Theme').attr('id','aTheme').addClass('themeColumn'));
                $text.append($('<div/>').html('Type of questions').attr('id','aTypeOfQuestions').addClass('typeColumn'));
                $text.append($('<div/>').html('Number of questions').attr('id','aNumberOfQuestions').addClass('numberColumn'));
                $text.append($('<div/>').html('Difficulty').attr('id','aDifficulty').addClass('difficultyColumn'));
                $text.append($('<div/>').html('Speed scoring').attr('id','aSpeedScoring').addClass('speedScoringColumn'));

                
                var $list = $('<ul/>').attr('id','roundsProperties');

                // Insert a list item for each word in the word list
                // received from the server.
                
                $list
                    .append($('<li/>')
                            .val(0)                   
                            .append($('<button/>').attr('id','deleteRound').html('-').addClass('btn').addClass('addColumn'))
                            .append($('<a/>').attr('id','roundName').html('Round 1').addClass('roundColumn'))
                            
                            .append($('<select/>')
                                .addClass('btn')
                                .addClass('themeColumn')
                                .attr('id','roundTag')
                                .append($('<option/>').val('random').html('Random'))
                                .append($('<option/>').val('art').html('Art'))
                                .append($('<option/>').val('geography').html('Geography'))
                                .append($('<option/>').val('history').html('History'))
                            )
                            .append($('<select/>')
                                .addClass('btn')
                                .addClass('typeColumn')
                                .attr('id','roundQuestionType')
                                .append($('<option/>').val('multipleChoiceSingleAnswer').html('Multi choice'))
                                .append($('<option/>').val('openQuestion').html('Open answer'))
                                .append($('<option/>').val('priorityQuestion').html('Ranking questions'))
                            )
                            
                            .append($('<div/>')
                                .addClass('numberColumn')
                                .append($('<input/>')
                                    .attr('id','roundNumberOfQuestions')
                                )
                            )
                            
                            .append($('<select/>')
                                .addClass('btn')
                                .addClass('difficultyColumn')
                                .attr('id','roundDifficulty')
                                .append($('<option/>').val('mix').html('All'))
                                .append($('<option/>').val('easy').html('Easy'))
                                .append($('<option/>').val('medium').html('Medium'))
                                .append($('<option/>').val('hard').html('Hard'))
                            )
                            .append($('<div/>')
                                .addClass('speedScoringColumn')
                                .append($('<input/>')
                                    .attr('id','roundSpeedScoring')
                                    .attr('type','checkbox')
                                    .addClass('btn')
                                )
                            )
                            
                            
                        

                    )
                    .append($('<li/>')
                        .append($('<button/>').attr('id','addRound').html('Add a round').addClass('btn'))
                    )
            

                App.Host.numberOfRounds = 1;
                // Insert the list onto the screen.
                //$('#divRoundProperties').html($list);

                var $total = $('<div/>');
                $total.append($text).append($list);
                $('#divRoundProperties').html($total);

                //var liItems = document.getElementById('roundsProperties').getElementsByTagName('li');
                //console.log(liItems[1].innerHTML);
                
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

            /*
             * Function called when a "+" button is clicked on the game set up page
             */

             addRound : function(){
                App.Host.numberOfRounds +=1;
                var $newLi = $('<li/>')
                            .val(App.Host.numberOfRounds-1)                   
                            .append($('<button/>').attr('id','deleteRound').html('-').addClass('btn').addClass('addColumn'))
                            .append($('<a/>').attr('id','roundName').html('Round ' + App.Host.numberOfRounds).addClass('roundColumn'))
                            
                            .append($('<select/>')
                                .addClass('btn')
                                .addClass('themeColumn')
                                .attr('id','roundTag')
                                .append($('<option/>').val('random').html('Random'))
                                .append($('<option/>').val('art').html('Art'))
                                .append($('<option/>').val('geography').html('Geography'))
                                .append($('<option/>').val('history').html('History'))
                            )
                            .append($('<select/>')
                                .addClass('btn')
                                .addClass('typeColumn')
                                .attr('id','roundQuestionType')
                                .append($('<option/>').val('multipleChoiceSingleAnswer').html('Multi choice'))
                                .append($('<option/>').val('openQuestion').html('Open answer'))
                                .append($('<option/>').val('priorityQuestion').html('Ranking questions'))
                            )
                            
                            .append($('<div/>')
                                .addClass('numberColumn')
                                .append($('<input/>')
                                    .attr('id','roundNumberOfQuestions')
                                )
                            )
                            
                            .append($('<select/>')
                                .addClass('btn')
                                .addClass('difficultyColumn')
                                .attr('id','roundDifficulty')
                                .append($('<option/>').val('mix').html('All'))
                                .append($('<option/>').val('easy').html('Easy'))
                                .append($('<option/>').val('medium').html('Medium'))
                                .append($('<option/>').val('hard').html('Hard'))
                            )
                            .append($('<div/>')
                                .addClass('speedScoringColumn')
                                .append($('<input/>')
                                    .attr('id','roundSpeedScoring')
                                    .attr('type','checkbox')
                                    .addClass('btn')
                                )
                            );
                            
                $('#roundsProperties li:eq(-2)').after($newLi);
                
             },

             /*
              * Function called when a '-' button is clicked on the game set up page
              */

            deleteRound : function(){
                var $btn = $(this);
                var $li = $btn.parent();
                var $ul = $li.parent();
                var rank = $li.val();
                // Cannot delete only remaining round
                if (App.Host.numberOfRounds !=1){
                    // Remove the deleted round
                    $li.remove();
                    App.Host.numberOfRounds -=1;

                    // Modifies the number of the other rounds
                    $('#roundsProperties li').each(function(index) {
                        if ((rank-1 < index ) && ( index < App.Host.numberOfRounds)){
                            $(this).val(index);
                            $(this).children('#roundName').html(function() {
                                var number = index+1;
                              return "Round " + number;
                            }); 
                            //console.log($(this).val());

                            //console.log( index + ": " + $( this ).text() );
                        }
                        
                    });
                }
                
            },
            /**
             * Function called to generate the new game when button clicked
             */

            generateNewGame : function(){
                console.log('generateNewGame');
                var setupOfGame = [];
                $('#roundsProperties li').each(function(index) {
                    if (index < App.Host.numberOfRounds){
                        setupOfGame[index] = {  tag: $(this).find('#roundTag').val(), 
                                                questionType: $(this).find('#roundQuestionType').val(),
                                                numberOfQuestions: parseInt($(this).find('#roundNumberOfQuestions').val()),
                                                difficulty: $(this).find('#roundDifficulty').val(),
                                                speedScoring: $(this).find('#roundSpeedScoring').is(':checked')
                                             };
                        console.log($(this).find('#roundNumberOfQuestions').val());
                        console.log($(this).find('#roundDifficulty').val());
                        console.log($(this).find('#roundSpeedScoring').is(':checked'));
                        console.log($(this).find('#roundTag').val());
                    }
                });
                console.log(setupOfGame);

                var number = document.getElementById("numberOfPlayersInput").value;
                var isNotNumber = isNaN(number);
                if(isNotNumber){
                    console.log($('#messageNaN'));
                    $('#messageNaN').text('This is not a number, please enter a number of players.');
                }
                else{
                    App.Host.numberOfPlayers = parseInt(number);
                    IO.socket.emit('hostCreateNewGame', setupOfGame);
                }
                
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
                        App.Host.players[i].arrayOfScores = [];
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
                document.getElementById('audioBeginningQuestion').play();
                App.Host.questionNumberInCurrentRound+=1;

                // Change the host header
                $('#questionNumber').html('Question '+App.Host.questionNumberInCurrentRound+'/'+App.Host.totalNumberOfQuestionsInCurrentRound);

                // Insert the new word into the DOM
                $('#hostWord').html(data.questionText);
                App.doTextFit('#hostWord');

                //Displaying answers on the host screen
                App.Host.displayAnswers(data);

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
             * Display the answers on the Host's screen
             */
             displayAnswers: function(data){
                if ((data.questionType === 'multipleChoiceSingleAnswer') || (data.questionType === 'priorityQuestion')){

                    var $list = $('<ul/>').attr('id','ulAnswersHost');
                    $.each(data.arrayOfAnswers, function(){
                        $list                               
                            .append( $('<li/>')
                                .append($('<div/>')
                                    .append($('<div/>').addClass('answerHostPercentage').attr('id','percentage').html(''))
                                    .append($('<div/>').addClass('answersHost').attr('value',(this['value'])).html(this['value']))
                                    .append($('<div/>').addClass('answerHostPercentageBar').attr('id','percentageBar').html('').append($('<div>').html('')))
                                )
                                
                            )             
                    });     

                    console.log($list.html());
                    // Insert the list onto the screen.
                    $('#hostAnswers').html($list);
                }
             },

            /**
             * Function called to pause the game between sets of questions
             */

             pausingGame : function(data){
                console.log('pausingGame');
                App.Host.questionNumberInCurrentRound = 0;

                // Make the countdown disappear
                document.getElementById('countDownPerRound').innerHTML='';
                // Text to be diplayed
                var text = "Time to take a break!";
                $('#hostWord').text(text);
                App.doTextFit('#hostWord');

                // Create an array of players and score
                var sortArray = [];
                for (var i=0; i< App.Host.numPlayersInRoom; i++){
                    var currentPlayerName = App.Host.players[i].playerName;
                    var currentPlayerScore = App.Host.getTotalScoreOfPlayerInAllRounds(i);
                    sortArray.push({
                        name: currentPlayerName,
                        score: currentPlayerScore,
                    });
                    // alert(JSON.stringify(sortArray[i], null, 4));                    
                }

                sortArray.sort(function(a, b) { return b.score - a.score});

                // Create a leaderboard with the players' name & score
                // Insert it into the screen
                var leaderboardContent = new String();
                for (var i=0; i< App.Host.numPlayersInRoom; i++){
                    var leaderboardContent = leaderboardContent + "<div id='player"+ (i+1) +"Score' class='playerScore'><span class='rank'>" + (i+1) +"</span><span class='playerName'>" + sortArray[i].name +"</span><span class='score2'>"+ sortArray[i].score +"pts </span></div>";
                    console.log('leaderboardContent'+leaderboardContent);
                }

                leaderboardContent = "Here is the ranking!" + leaderboardContent;
                $('#leaderboard').html(leaderboardContent);
                
                // Creates a button to continue game
                var $btnContinueGame = $('<button/>')   
                            .addClass('btn')        
                            .addClass('btnContinueGame')
                            .attr('id','btnContinueGame')
                            .html('Going to the next round!')
                
                // Insert the button onto the screen.
                $('#divBtnContinueGame').html($btnContinueGame);

                App.Host.questionData = data;
                App.Host.currentRound = data.round;
             },

             /**
              * Function called at the beginning of the round to present its properties
              */
            roundPresentation: function(data){
                console.log('Round presentation');
                App.Host.currentRoundNumber +=1;
                App.Host.totalNumberOfQuestionsInCurrentRound = data.setupOfGame.numberOfQuestions;

                // Display the number of the round in the host header
                $('#roundNumber').html('Round '+App.Host.currentRoundNumber);
                $('#questionNumber').html('');

                // Make the countdown disappear
                document.getElementById('countDownPerRound').innerHTML='';

                // Text to be diplayed
                var text = "Get ready for round " + data.roundIndex +"!";
                $('#hostWord').text(text);
                App.doTextFit('#hostWord');

                // Display the properties of the round and a button to begin next round
                var $ulProperties = $('<ul/>').attr('id','ulProperties');
                
                if (data.setupOfGame.tag === 'random'){var tag = 'Mixed themes';}
                else{var tag = data.setupOfGame.tag.charAt(0).toUpperCase() + data.setupOfGame.tag.slice(1);}

                console.log(data.setupOfGame.difficulty);
                if(data.setupOfGame.difficulty === 'mix'){var difficulty = 'Mixed difficulties';}
                else{var difficulty = data.setupOfGame.difficulty.charAt(0).toUpperCase() + data.setupOfGame.difficulty.slice(1);}

                switch(data.setupOfGame.questionType){
                    case 'random':
                        var questionType = 'Mixed question types';
                        break;
                    case 'multipleChoiceSingleAnswer':
                        var questionType = 'Mutliple choice questions';
                        break;
                    case 'openQuestion':
                        var questionType = 'Open questions';
                        break;
                    case 'priorityQuestion':
                        var questionType = 'Ranking questions';
                        break;
                    default:
                        var questionType = 'Unkown question type!';
                }
                
                if(data.setupOfGame.speedScoring){var speedScoring = 'Speed scoring';}
                else{var speedScoring = 'No speed scoring';}

                var numberOfQuestions = data.setupOfGame.numberOfQuestions + ' questions';

                $ulProperties
                            .append($('<li/>').html(numberOfQuestions))
                            .append($('<li/>').html(tag))
                            .append($('<li/>').html(questionType))
                            .append($('<li/>').html(difficulty))
                            .append($('<li/>').html(speedScoring))

                var $buttonBeginNextRound = $('<button/>').addClass('btn').addClass('btnBeginRound').attr('id','btnBeginRound').html('Begin this round!');
                
                $('#roundProperties').html($ulProperties);
                document.getElementById("roundProperties").style.border = "solid";
                $('#divBtnBeginGame').html($buttonBeginNextRound);


                // For each player, creates the array in which the scores of this round will be stored
                for (var i=0; i<App.Host.numPlayersInRoom; i++){
                    console.log("Creating the arrays for this round");
                    App.Host.players[i].arrayOfScores[App.Host.currentRoundNumber-1]=[]
                    console.log(App.Host.players[i].arrayOfScores[App.Host.currentRoundNumber-1]);
                }
            },

            /**
             * Function called at the end of the  screen presenting the following round
             */
            endOfRoundPresentation : function(){
                console.log('endOfRoundPresentation');
                $('#roundProperties').html('');
                $('#divBtnBeginGame').html('');
                document.getElementById("roundProperties").style.border = "none";
                App.currentRound += 1;

                var data = {
                    gameId : App.gameId,
                    round : App.currentRound
                }

                // Notify the server to start the next round.
                IO.socket.emit('hostNextRound',data);
               
            },
 
             /**
              * Function that is called to end the pause.
              */
             endOfPause : function(){
                console.log('endOfPause');
                // Deletes the 'Continue' button displayed during the pause
                $('#divBtnContinueGame').html('');
                $('#leaderboard').html('');
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
						if (App.Host.players[i].playerName === data.playerName){
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
			 	
                // Clear the countdown display
                $('#countDownPerRound').html('');

			 	// Advance the round
				App.currentRound += 1;
				
				// Calculates scores
				App.Host.calculateScores();

                // Creates an array with the scores and names
                var arrayOfScores = [];
                var arrayOfSocketIDs = [];
                for (var i=0; i<App.Host.numPlayersInRoom; i++){
                    var tempscore = App.Host.getTotalScoreOfPlayerInAllRounds(i);
                    console.log ('temporary var is'+tempscore);
                    arrayOfScores[i] = tempscore;
                    var tempid = App.Host.players[i].mySocketId;
                    arrayOfSocketIDs[i] = tempid;
                    console.log('ID of player'+i+'is '+arrayOfSocketIDs[i]);
                    console.log('Score of player'+i+'is '+arrayOfScores[i]);
                }
				
				// Prepare data to send to the server
				var data = {
					gameId : App.gameId,
					round : App.currentRound, 
                    arrayOfScores : arrayOfScores,
                    arrayOfSocketIDs : arrayOfSocketIDs,
                    questionType : App.Host.questionData.questionType
				}
				
				// Stops the timeout
				clearTimeout(App.Host.timeOut);
                IO.socket.emit('hostDisplayAnswer', data);

				
				// Notify the server to start the next round after x seconds.
                var nbSeconds = 10000;
                if(App.Host.questionData.questionType === 'priorityQuestion'){
                    nbSeconds = 15000;
                }
                setTimeout(function(){
                    console.log('Host is gonna emit the signal hostNextRound');
                    for (var i=0; i<App.Host.numPlayersInRoom; i++){
                        App.Host.players[i].hasAlreadyAnswered = false;
                        delete App.Host.players[i].currentAnswer;
                    }
                    console.log('The host is gonna emit the signal hostDisplayAnswer');
                    IO.socket.emit('hostNextRound',data);
                    // Delete the display of the answers
                    $('#hostAnswers').html('');
                    
                },nbSeconds)
				console.log('end of endThisRound fucntion');
			 },

             /*
              * Function that displays the correct answer after the end of the round
              */

             displayCorrectAnswer: function(data){
                console.log('displayCorrectAnswer');

                switch(App.Host.questionData.questionType){
                    case 'multipleChoiceSingleAnswer':
                        App.Host.displayPercentageMultiChoice();
                        setTimeout(App.Host.displayCorrectAnswerMultipleChoiceQuestions,5000);
                        break;
                    
                    case 'openQuestion':
                        var $div = $('<div/>').attr('id','openQuestionAnswerHost').html('Correct answer: ' + App.Host.questionData.arrayOfAnswers[0]['value']);
                        $('#hostAnswers').html($div);
                        break;

                    
                    case 'priorityQuestion':
                        App.Host.displayPercentagePriorityRanking();
                        setTimeout(function(){App.Host.putPriorityAnswerAtCorrectPosition(0);},5000);
                        break;
                    
                    default:
                        console.log('Question type unknown!!!');
                }
             },

             displayPercentageMultiChoice: function(){
                var counts = [];
                for (var i=0; i<App.Host.questionData.arrayOfAnswers.length; i++){
                    var value = App.Host.questionData.arrayOfAnswers[i]['value'];

                    // Calculates the percentage of players that have chosen this answer
                    var count = 0;
                    //console.log('value for this button: ' + value);
                    for(var j=0; j<App.Host.players.length; j++){
                        //console.log(App.Host.players[j]);
                        //console.log('player answer: ' + App.Host.players[j].currentAnswer);
                        if(App.Host.players[j].currentAnswer === value){
                            count += 1;
                        }
                    }

                    counts[i] = count/App.Host.numPlayersInRoom*100;
                }

                $('.answerHostPercentageBar').each(function(index){
                    var percentage = counts[index] + '%';
                    $(this).children().animate({width: percentage}, {duration : 5000 * counts[index]/100,
                                                                    easing: 'linear',
                                                                    queue: false,
                                                                    step: function(now, fx) {
                                                                       if(fx.prop == 'width') {
                                                                           $(this).html('   ' + Math.round(now) + '%');
                                                                       }
                                                                    }})
                });

             },

             /**
              * Function that displays the correct answers for the multiple choice questions
              */
            displayCorrectAnswerMultipleChoiceQuestions : function(){
                var values = [];
                for (var i=0; i<App.Host.questionData.arrayOfAnswers.length; i++){
                    var value = App.Host.questionData.arrayOfAnswers[i]['value'];
                    if(App.Host.questionData.arrayOfAnswers[i]['bool']){
                        values[i] = value;
                        console.log(value)
                        //Find the corresponding item and change its css and setting background to green
                        //$('#ulAnswersHost').find("[value='"+value+"']").css('background-color','#008000');
                    }


                    // The following code displays circular progress bars at the end of the question
                    /*
                    // Calculates the percentage of players that have chosen this answer
                    var count = 0;
                    //console.log('value for this button: ' + value);
                    for(var j=0; j<App.Host.players.length; j++){
                        //console.log(App.Host.players[j]);
                        //console.log('player answer: ' + App.Host.players[j].currentAnswer);
                        if(App.Host.players[j].currentAnswer === value){
                            count += 1;
                        }
                        //console.log('count: ' + count);
                    }

                    //console.log(count/App.Host.numPlayersInRoom*100)
                
                    var $progressBar = $('<input/>').addClass('knob')
                                                        .addClass('percentageKnob')
                                                        .attr('data-width','100')
                                                        .attr('data-displayInput','true')
                                                        .attr('data-readOnly','true')
                                                        .attr('data-width','75%')
                                                        .attr('data-height','75%')
                                                        .attr('value',count/App.Host.numPlayersInRoom*100)
                    //console.log($progressBar);
                    var $divProgressBar = $('#ulAnswersHost').find("[value='"+value+"']").parent().children("[class='answerHostPercentage']");
                    //console.log($divProgressBar);
                    //var $divHostAnswer = $('#ulAnswersHost').find("[value='"+value+"']");
                    var $li = $('#ulAnswersHost').find("[value='"+value+"']").parent().parent();
                    var position = $li.position();
                    //console.log("left: " + position.left + ", top: " + position.top)
                    //console.log("height "+$li.height())
                    $divProgressBar.css('position','absolute').css('top',position.top).css('left',position.left)
                    $divProgressBar.html($progressBar)
            
                    $('.knob').each(function () {

                       var $this = $(this);
                       var myVal = $this.attr("value");
                       $this.knob({});
                       $({value: 0}).animate({
                            value: myVal
                            }, 
                            {duration: 2000,easing: 'swing',step: function () {
                               $this.val(Math.ceil(this.value)).trigger('change');
                            }
                            })

                   });
                */
                }
            var flashInterval = setInterval(function() {
                for(var j=0; j<values.length; j++){
                    if(typeof(values[j]) != undefined){
                        $('#ulAnswersHost').find("[value='"+values[j]+"']").toggleClass('flashing-border');
                    }
                }
            }, 300);

            // Stop flashing after 5 seconds
            setTimeout(function(){
                for(var j=0; j<values.length; j++){
                    if(typeof(values[j]) != undefined){
                        clearInterval(flashInterval)
                        $('#ulAnswersHost').find("[value='"+values[j]+"']").toggleClass('flashing-border');
                    }
                }
            },5000)
            },

			 
			 /**
              * Function that displays the priority answers in the correct order
              */

            putPriorityAnswerAtCorrectPosition : function(index){
                var correctWordAtThisPosition = App.Host.questionData.correctOrderArrayOfAnswers[index]['value'];
                //console.log(correctWordAtThisPosition);
                var $btn = $('#ulAnswersHost').find("[value='"+correctWordAtThisPosition+"']");
                var $li = $btn.parent().parent();

                var callback = function() {
                    
                    $li.insertBefore($li.siblings(':eq('+ index +')'));
                    // Displays the answers in green. Commented for now
                    //$btn.css('background-color', '#008000');

                    // Display the border in green
                    $('#ulAnswersHost').find("[value='"+correctWordAtThisPosition+"']").toggleClass('flashing-border');
                    
                    // Calls the next answer diplay if necessary
                    if(index<App.Host.questionData.correctOrderArrayOfAnswers.length-1){
                        App.Host.putPriorityAnswerAtCorrectPosition(index+1);
                    }

                    // The following code allows to display circular progress bars next to the answers.
                    /*
                    else{
                        console.log('setting timer');
                        setTimeout(App.Host.displayCircularPercentagePriorityRanking, 2000);
                    }
                    */
                };
                
                $li.slideUp(1000, callback).slideDown(1000);
                
            },

            displayPercentagePriorityRanking: function(){
                var counts = [];
                for (var i=0; i<App.Host.questionData.arrayOfAnswers.length; i++){
                    var value = App.Host.questionData.correctOrderArrayOfAnswers[i]['value'];

                    // Calculates the percentage of players that have chosen this answer
                    var count = 0;
                    for(var j=0; j<App.Host.players.length; j++){
                        if(App.Host.players[j].currentAnswer[i] === value){
                            count += 1;
                        } 
                    }
                    counts[i] = count/App.Host.numPlayersInRoom*100
                }

                $('.answerHostPercentageBar').each(function(index){
                    var percentage = counts[index] + '%';
                    $(this).children().animate({width: percentage}, {duration : 5000 * counts[index]/100,
                                                                    easing: 'linear',
                                                                    queue: false,
                                                                    step: function(now, fx) {
                                                                       if(fx.prop == 'width') {
                                                                           $(this).html('   ' + Math.round(now) + '%');
                                                                       }
                                                                    }})
                });
            },

            displayCircularPercentagePriorityRanking : function(){
                for (var i=0; i<App.Host.questionData.arrayOfAnswers.length; i++){
                    var value = App.Host.questionData.correctOrderArrayOfAnswers[i]['value'];

                    // Calculates the percentage of players that have chosen this answer
                    var count = 0;
                    //console.log('value for this button: ' + value);
                    for(var j=0; j<App.Host.players.length; j++){
                        //console.log(App.Host.players[j]);
                        //console.log('player answer: ' + App.Host.players[j].currentAnswer[i]);
                        if(App.Host.players[j].currentAnswer[i] === value){
                            count += 1;
                        } 
                    }
                    //console.log('count: ' + count);
                    //console.log(count/App.Host.numPlayersInRoom*100)
                
                    var $progressBar = $('<input/>').addClass('knob')
                                                        .addClass('percentageKnob')
                                                        .attr('data-width','100')
                                                        .attr('data-displayInput','true')
                                                        .attr('data-readOnly','true')
                                                        .attr('data-width','75%')
                                                        .attr('data-height','75%')
                                                        .attr('value',count/App.Host.numPlayersInRoom*100)
                                                        .attr('line',i)
                    //console.log($progressBar);
                    var $divProgressBar = $('#ulAnswersHost').find("[value='"+value+"']").parent().children("[class='answerHostPercentage']");
                    //console.log($divProgressBar);
                    //var $divHostAnswer = $('#ulAnswersHost').find("[value='"+value+"']");
                    var $li = $('#ulAnswersHost').find("[value='"+value+"']").parent().parent();
                    var position = $li.position();
                    //console.log("left: " + position.left + ", top: " + position.top)
                    //console.log("height "+$li.height())
                    $divProgressBar.css('position','absolute').css('top',position.top).css('left',position.left)
                    $divProgressBar.html($progressBar)
                    

                    $('.knob').each(function () {
                        var $this = $(this);
                        var myVal = $this.attr("value");
                        if (parseInt($this.attr('line')) === i){
                            $this.knob({});
                                $({value: 0}).animate({
                                    value: myVal
                                    }, 
                                    {duration: 2000,easing: 'swing',step: function () {
                                       $this.val(Math.ceil(this.value)).trigger('change');}})        
                        }
                        

                   });
                }
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
             * Calculate the scores after the end of the round
             */
             calculateScores : function(){
			     // Calls the appropriate scoring function for each player
                 for (var i=0; i<App.Host.numPlayersInRoom; i++){
                    /*
                    if (typeof(App.Host.players[i].score) === 'undefined'){
                        App.Host.players[i].score = 0;
                    }
                    */

                    var $pScore = $('#' + App.Host.players[i].mySocketId);
                    var scoreForThisRound = 0;
                    App.Host.calculateMinMaxPoints();
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
                        if (typeof(App.Host.players[i].timeOfAnswer) != 'undefined'){
                            var secondToAnswer = (App.Host.players[i].timeOfAnswer - App.Host.timeBeginningQuestion)/1000;
                            scoreForThisRound *= 1-secondToAnswer/App.Host.secondsForThisRound;
                            scoreForThisRound = Math.round(scoreForThisRound * 100) / 100
                        }
                     }
                     
                     $pScore.text( +$pScore.text() +  scoreForThisRound);
                     console.log('Points for player ' + App.Host.players[i].mySocketId + ' for this round: ' + scoreForThisRound);

                     // Saves the score in the array of scores of the player
                     App.Host.players[i].arrayOfScores[App.Host.currentRoundNumber-1][App.Host.questionNumberInCurrentRound-1]=scoreForThisRound

                     console.log('Total points for player for this round after array has been upated: ' + App.Host.getTotalScoreOfPlayerInCurrentRound(i))

                     App.Host.players[i].answer = '';
                     App.Host.players[i].timeOfAnswer = 0;
                 }
             },

             getTotalScoreOfPlayerInGivenRound : function(playerIndex, round){
                // If needed, we can change the function to get the score of the player by name. We'll see what's more convenient
                // In that case use App.Host.players[i].playerName

                // The round number of the first round is 0.
                var scoreForRound = 0
                var array = App.Host.players[playerIndex].arrayOfScores[round]
                for (var i=0; i<array.length; i++){
                    scoreForRound += array[i]
                }

                return Math.round(scoreForRound * 100) / 100
                
             },

             getTotalScoreOfPlayerInCurrentRound : function(playerIndex){
                
                return App.Host.getTotalScoreOfPlayerInGivenRound(playerIndex, App.Host.currentRoundNumber-1)
                
             },

             getTotalScoreOfPlayerInAllRounds : function(playerIndex){
                var totalScore = 0;
                for (var j=0; j<App.Host.currentRoundNumber; j++){
                    totalScore += App.Host.getTotalScoreOfPlayerInGivenRound(playerIndex, j)
                }
                return Math.round(totalScore * 100) / 100
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
                    /*
                    if (playerAnswer === App.Host.questionData.arrayOfAnswers[0]['value']){
                        scoreForThisRound = App.Host.maxPoints;
                    }
                    else{
                        scoreForThisRound = App.Host.minPoints;
                    }
                    */
                    // The Levenshtein represents the distance between the two strings
                    var levenshtein = App.getEditDistance(playerAnswer.toLowerCase(), App.Host.questionData.arrayOfAnswers[0]['value'].toLowerCase());
                    if (levenshtein < Math.round(App.Host.questionData.arrayOfAnswers[0]['value'].length*0.2)){
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
                // Replace commas with dots
                var correctAnswer = App.Host.questionData.arrayOfAnswers[0]['value'];
                var scoreForThisRound = 0;
                var range = 0.2;
                console.log('playerAnswer '+playerAnswer); 
                // checks if the answer is not empty and is a number
                if ((typeof(playerAnswer) != 'undefined') && (parseInt(playerAnswer) != NaN)){
                    playerAnswer = parseFloat(playerAnswer.replace(/,/g, '.'));
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
                        var word = App.Host.questionData.correctOrderArrayOfAnswers[i]['value'];
                        playerAnswer[i] = playerAnswerText.indexOf(word);
                    }
                } 
                var scoreForThisRound = 0;
                var maxPoints = App.Host.questionData.maxPoints;
                var minPoints = App.Host.questionData.minPoints;
                var rev = correctAnswer.slice(0).reverse();
                var distanceMax = App.distanceBetweenArrays(correctAnswer,rev);
                var range = 0.5; // Percentage of distanceMax from which the score is set to minPoints
                if(typeof(playerAnswerText) != 'undefined'){
                    if (playerAnswer.indexOf(-1) === -1){
                        var distance = App.distanceBetweenArrays(playerAnswer,correctAnswer);
                        if(distance < range*distanceMax){
                            scoreForThisRound = App.Host.maxPoints - distance*(App.Host.maxPoints-App.Host.minPoints)/(distanceMax*range);
                        }
                        else{
                            scoreForThisRound = App.Host.minPoints;
                        }
                        scoreForThisRound = Math.round(scoreForThisRound * 100) / 100
                    }
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

                // Setting all buttons to original border style
                var $ul = $btn.parent().parent();
                $ul.children().each(function() {
                    $($(this).children()).css('border-style','hidden');
                });

                // Setting this button border to black and visible
                $btn.css('border-style','solid');
                $btn.css('border-width','10px');
                $btn.css('border-color','#000000');
                
                var answer = $btn.val(); // The tapped word
                console.log(answer);

                // Send the player info and tapped word to the server so
                // the host can check the answer.
                var data = {
                    gameId: App.gameId,
                    playerId: App.mySocketId,
                    playerName: App.Player.myName,
                    answer: answer,
                    round: App.currentRound,
                    timeOfAnswer: new Date().getTime()
                }
                IO.socket.emit('playerAnswer',data);
            },

            onPlayerAnswerClickOpenQuestion: function() {
                console.log('Clicked Answer Button');
                // Changing the css of the button
                var $btn = $(this);
                $btn.css('border-style','solid');
                $btn.css('border-width','5px');
                $btn.css('border-color','#000000');
                
                var answer = document.getElementById("openQuestionText").value;
                // Send the player info and tapped word to the server so
                // the host can check the answer.
                var data = {
                    gameId: App.gameId,
                    playerId: App.mySocketId,
                    playerName: App.Player.myName,
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
                $('#answersArea').html("<h3>Waiting on host to start new game.</h3>");
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
                // Display the Player Game HTML on the player's screen.
                App.$gameArea.html(App.$templateplayerGame);

                // Updates diplay of name
                console.log('my name is '+App.Player.myName)
                $('#playerScore')
                .find('.playerName')
                .html(App.Player.myName);

                App.Player.hostSocketId = hostData.mySocketId;
                $('#answersArea')
                    .html('<div class="gameOver">Get Ready!</div>');
            },

            /*
             * Function called to pause the game.
             */

            pausingGame : function(data){
                console.log('pausingGame');
                var $pauseText = $('<div/>').attr('id','pausingText').html('Pausing game. <br>Have a drink and come back!').addClass('info')
                $('#answersArea').html($pauseText);
            },

            /*
             * Function called for the round's presentation
             */

            roundPresentation: function(data){
                console.log('roundPresentation');
                var $presentationText = $('<div/>').attr('id','presentationText').html('Round is about to begin. <br>You better be ready!').addClass('info')
                $('#answersArea').html($presentationText);
            },
            /**
             * Show the list of words for the current round.
             * @param data{{round: *, word: *, answer: *, list: Array}}
             */
            newQuestion : function(data) {
                console.log('Player newQuestion called');
                console.log(data.questionType);
                App.Player.priorityAnswerCurrentRanking = 0;
                App.Player.questionData = data;


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
                $('#answersArea').html($list);
            },

            newQuestionOpenQuestion : function(data){
                var $list = $('<ul/>').attr('id','ulAnswers');

                
                $list                                
                    .append($('<li/>').append($('<input/>').attr('id','openQuestionText')))
                    .append($('<li/>').append( $('<button/>').addClass('btnOpenAnswer').addClass('btn').val('submit').html('Submit')))
                    .append($('<li/>').append($('<div/>').attr('id','resultOpenQuestion')))
            

                // Insert the list onto the screen.
                $('#answersArea').html($list);
            },

            newQuestionPriorityQuestion : function(data){
                //var answersShuffled = App.shuffle(data.arrayOfAnswers);
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
                        .append($('<div/>').attr('id','rankingSubmitDelete')
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
                    )

                

                // Insert the list onto the screen.
                $('#answersArea').html($list);

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

                // Changing the css of the button
                var $btn = $(this);
                $btn.css('border-style','solid');
                $btn.css('border-width','5px');
                $btn.css('border-color','#000000');
                
                var answer = [];
                var elems = document.getElementsByTagName('*'), i;
                for (i in elems) {
                    if((' ' + elems[i].className + ' ').indexOf(' ' + 'btnPriorityAnswerNumber' + ' ')
                            > -1) {
                        answer[parseInt(elems[i].innerHTML)-1] = elems[i].id;
                    }
                }
                console.log(answer);

                // Send the player info and tapped word to the server so
                // the host can check the answer.
                var data = {
                    gameId: App.gameId,
                    playerId: App.mySocketId,
                    playerName: App.Player.myName,
                    answer: answer,
                    round: App.currentRound,
                    timeOfAnswer: new Date().getTime()
                }
                console.log(answer);
                IO.socket.emit('playerAnswer',data);
            },

            /**
             * Function called to display the correct answer at the end of the round
             */

            displayCorrectAnswer: function(data){
                console.log('displayAnswer');
                
                switch(App.Player.questionData.questionType){

                    case 'multipleChoiceSingleAnswer':
                        setTimeout(App.Player.displayCorrectAnswerMultipleChoiceQuestions,5000);
                        break;

                    case 'openQuestion':
                        $('#resultOpenQuestion').html('Correct answer: ' + App.Player.questionData.arrayOfAnswers[0]['value']);
                        break;

                    case 'priorityQuestion':
                        setTimeout(function(){App.Player.putPriorityAnswerAtCorrectPosition(0);},5000); 
                        break;

                    default:
                        console.log('Unkown question type!!!');
                }
            },
                
            /**
             * Updates the score of the player
             */
            updatePlayerScore: function(data){
                console.log('playerNewScore');
                console.log(IO.socket.socket.sessionid);

                // Find the player score in the array of scores
                if (typeof(data.arrayOfScores) != 'undefined'){
                    var i = 0;
                    while (IO.socket.socket.sessionid != data.arrayOfSocketIDs[i]){
                        i = i+1;
                    }
                }
                //console.log('the selected socketID is'+IO.socket.socket.sessionid);
                //console.log('my player socket ID is'+data.arrayOfSocketIDs[i]);
                var myScore = data.arrayOfScores[i];
                console.log('my Score is '+myScore);

                var oldScore = $('#playerScore').find('.score').html();

                if (myScore-oldScore >= 0){
                    var message = '+'+(myScore-oldScore).toString();
                }
                else{
                    var message = (myScore-oldScore).toString();
                }
                var $displayScore = $('<p/>').html(message).css({
                    "position":"absolute",
                    "font-size":"2em",
                    'width':'20%',
                    'height':'16%',
                    'top':'0px',
                    'left':'0px',
                    'vertical-align': 'middle',
                    'text-align': 'center',
                    'font-weight':'900',
                    'padding-top':'2%'});
                //$('#scoreMessage').html($displayScore)
                $('#gameArea').append($displayScore)
                $displayScore.fadeOut( "slow", function() {});


                $('#playerScore').find('.score').html(myScore);               
            },

            displayCorrectAnswerMultipleChoiceQuestions : function(){
                for (var i=0; i<App.Player.questionData.arrayOfAnswers.length; i++){
                    if(App.Player.questionData.arrayOfAnswers[i]['bool']){
                        // Find the corresponding item and change its css
                        var value = App.Player.questionData.arrayOfAnswers[i]['value'];
                        // Setting background to green
                        $('#ulAnswers').find("[value='"+value+"']").css('background-color','#008000');
                    }
                }
            },

            putPriorityAnswerAtCorrectPosition : function(index){
                var correctWordAtThisPosition = App.Player.questionData.correctOrderArrayOfAnswers[index]['value'];
                console.log(correctWordAtThisPosition + ' ' + index)
                var $li = $('#ulAnswers').find("[id='"+correctWordAtThisPosition+"']").parent();
                var callback = function() {
                    $li.insertBefore($li.siblings(':eq('+ index +')'));
                    var $number = $li.children("[id='"+correctWordAtThisPosition+"']");
                    if (parseInt($number.html()) === index+1){
                        $number.css('background-color', '#008000');
                    }
                    else{
                        $number.css('background-color', '#FF0000');
                    }
                    if(index<App.Player.questionData.correctOrderArrayOfAnswers.length-1){
                        App.Player.putPriorityAnswerAtCorrectPosition(index+1);
                    }
                };
                $li.slideUp(1000, callback).slideDown(1000);
            },

            /**
             * Show the "Game Over" screen.
             */
            endGame : function() {
                $('#answersArea')
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
        shuffle : function(o){
            o = o.slice(0)
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
        },

        getEditDistance : function(a, b) {
          if(a.length === 0) return b.length; 
          if(b.length === 0) return a.length; 
         
          var matrix = [];
         
          // increment along the first column of each row
          var i;
          for(i = 0; i <= b.length; i++){
            matrix[i] = [i];
          }
         
          // increment each column in the first row
          var j;
          for(j = 0; j <= a.length; j++){
            matrix[0][j] = j;
          }
         
          // Fill in the rest of the matrix
          for(i = 1; i <= b.length; i++){
            for(j = 1; j <= a.length; j++){
              if(b.charAt(i-1) == a.charAt(j-1)){
                matrix[i][j] = matrix[i-1][j-1];
              } else {
                matrix[i][j] = Math.min(matrix[i-1][j-1] + 1, // substitution
                                        Math.min(matrix[i][j-1] + 1, // insertion
                                                 matrix[i-1][j] + 1)); // deletion
              }
            }
          }
         
          return matrix[b.length][a.length];
        },

        draw : function () {
            console.log('draw');
            // "tron" case
            if(this.$.data('skin') == 'tron') {

                this.cursorExt = 0.3;

                var a = this.arc(this.cv)  // Arc
                    , pa                   // Previous arc
                    , r = 1;

                this.g.lineWidth = this.lineWidth;

                if (this.o.displayPrevious) {
                    pa = this.arc(this.v);
                    this.g.beginPath();
                    this.g.strokeStyle = this.pColor;
                    this.g.arc(this.xy, this.xy, this.radius - this.lineWidth, pa.s, pa.e, pa.d);
                    this.g.stroke();
                }

                this.g.beginPath();
                this.g.strokeStyle = r ? this.o.fgColor : this.fgColor ;
                this.g.arc(this.xy, this.xy, this.radius - this.lineWidth, a.s, a.e, a.d);
                this.g.stroke();

                this.g.lineWidth = 2;
                this.g.beginPath();
                this.g.strokeStyle = this.o.fgColor;
                this.g.arc( this.xy, this.xy, this.radius - this.lineWidth + 1 + this.lineWidth * 2 / 3, 0, 2 * Math.PI, false);
                this.g.stroke();

                return false;
            }
        }


    };

    IO.init();
    App.init();

}($));

