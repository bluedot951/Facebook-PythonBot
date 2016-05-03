var fs = require('fs');
var express = require('express');
var bodyParser = require('body-parser');
var request = require('request');
var app = express();
var PythonShell = require('python-shell');

app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());
app.listen((process.env.PORT || 3000));

// Server frontpage
app.get('/', function (req, res) {
	res.send('This is TestBot Server');
});

// Facebook Webhook
app.get('/webhook', function (req, res) {
	if (req.query['hub.verify_token'] === 'testbot_verify_token') {
		res.send(req.query['hub.challenge']);
	} else {
		res.send('Invalid verify token');
	}
});

app.post('/webhook', function (req, res) {
	var events = req.body.entry[0].messaging;
	for (i = 0; i < events.length; i++) {
		var event = events[i];

		if (event.message && event.message.text) {
			// if (!evalMessage(event.sender.id, event.message.text)) {
			// sendMessage(event.sender.id, {text: "Echo: " + event.message.text});
			// }

			evalMessage(event.sender.id, event.message.text);
		}
		else if (event.postback) {
			console.log("Postback received: " + JSON.stringify(event.postback));
		}

	}
	res.sendStatus(200);
});

function sendMessage(recipientId, message) {
	console.log("in send message!");

	request({
		url: 'https://graph.facebook.com/v2.6/me/messages',
		qs: {access_token: process.env.PAGE_ACCESS_TOKEN},
		method: 'POST',
		json: {
			recipient: {id: recipientId},
			message: message,
		}
	}, function(error, response, body) {
		if (error) {
			console.log('Error sending message: ', error);
		} else if (response.body.error) {
			console.log('Error: ', response.body.error);
		}
	});
};

function evalMessage(recipientId, text) {

	console.log("IN EVAL MESSAGE");
	console.log("text: " + text);

	text = text || "";
	var values = text.split('\n');

	var options = {}

	if (values[0] === 'eval') {

		var code = "";

		if (values[1] === 'args') {
			options['args'] = (values[1].substring(4)).split(" ");
			values.splice(0,2);
			code = values.join("\n");
			// code = values.splice(0,2);
		}
		else {
			values.splice(0,1);
			code = values.join("\n");
			// code = values.splice(0,1);
		}

		console.log("CODE: " + code);



		fs.writeFile("my_script.py", code, function(err) {
		    if(err) {
		    	sendMessage(recipientId, {text: "Sorry, an error occured."});
		        console.log(err);
		        return false;
		    }


			PythonShell.run('my_script.py', options, function (err, results) {
					if (err) {
						sendMessage(recipientId, {text: "Sorry, an error occured."});
						console.log(err);
						return false;
					}
				  	console.log('results: %j', results);

				  	toSend = "";

				  	for(q = 0; q < results.length; q++) {
				  		toSend += results[q] + "\n";
				  	}

			  		sendMessage(recipientId, {text: toSend});

				  	return true;
			});
		});
	}

	else {
		console.log(values);
	}

	return false;

};


