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

var prevCode = {};

// Facebook Webhook
app.get('/webhook', function (req, res) {;
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
			console.log("in webhook.event.message...");

			// sendMessage(event.sender.id, "Echo: " + event.message);

			var infoArr = getCode(event.message.text);
			var code = infoArr[0];
			var args = infoArr[1];

			console.log("webhook...code: " + code);
			console.log("----webhook...code")
			console.log("webhook...args: ");
			console.log(args);
			console.log("----webhook...args")

			sendMessage(event.sender.id, "Evaluating the following Python code:\n```python\n" + code);


			evalCode(code, args, function processOutput(output) {
				console.log("webhook...output: " + output);
				console.log("---webhook...output");



				var formData = {
					api_option: 'paste',
					api_dev_key: process.env.PAGE_ACCESS_TOKEN,
					api_paste_code: output
				};


				request({
					url: 'http://pastebin.com/api/api_post.php',
					method: 'POST',
					formData: formData
				}, function(error, response, body) {
					console.log(response.body);
					sendMessage(event.sender.id, response.body);	
					prevCode[event.sender.id + ""] = [code, args];

					sendStructuredMessage(event.sender.id);

					if (error) {
						console.log('Error sending message: ', error);
					} else if (response.body.error) {
						console.log('Error: ', response.body.error);
					}
				});



			});
		}
		else if (event.postback) {
			console.log("Postback received: " + JSON.stringify(event.postback));
			console.log(prevCode);
			console.log("postback: " + JSON.stringify(event.postback));
			console.log("payload: " + event.postback['payload']);
			console.log("in prevCode: " + prevCode[event.postback['payload']]);
			infoArr = prevCode[event.postback['payload']];

			var code = infoArr[0];
			var args = infoArr[1];

			sendMessage(event.sender.id, "Evaluating the following Python code:\n```python\n" + code);

			evalCode(code, args, function processOutput(output) {
				console.log("webhook...output: " + output);
				console.log("---webhook...output");




				sendMessage(event.sender.id, output);	

				sendStructuredMessage(event.sender.id);

			});

		}

	}
	res.sendStatus(200);
});

function sendStructuredMessage(recipientId) {
	messageData = {
		"attachment": {
			"type": "template",
			"payload": {
				"template_type": "generic",
				"elements": [{
					"title": "Evaluation complete!",
					"subtitle": "Would you like to reevaluate the script?",
					"buttons": [{
						"type": "postback",
						"title": "Reevaluate",
						"payload": recipientId
					}]
	          // },
	          // {
	          //   "type": "postback",
	          //   "title": "Reevaluate",
	          //   "payload": "opt" + recipientId
	          // }],
	      }]
	  }
	}
};

console.log("in send structuted message!");

request({
	url: 'https://graph.facebook.com/v2.6/me/messages',
	qs: {access_token: process.env.PAGE_ACCESS_TOKEN},
	method: 'POST',
	json: {
		recipient: {id: recipientId},
		message: messageData,
	}
}, function(error, response, body) {
	if (error) {
		console.log('Error sending message: ', error);
	} else if (response.body.error) {
		console.log('Error: ', response.body.error);
	}
});
};

function sendMessage(recipientId, message) {
	console.log("in send message!");
	console.log(message);

	console.log({
		url: 'https://graph.facebook.com/v2.6/me/messages',
		qs: {access_token: process.env.PAGE_ACCESS_TOKEN},
		method: 'POST',
		json: {
			recipient: {id: recipientId},
			message: {text: message},
		}
	});

	request({
		url: 'https://graph.facebook.com/v2.6/me/messages',
		qs: {access_token: process.env.PAGE_ACCESS_TOKEN},
		method: 'POST',
		json: {
			recipient: {id: recipientId},
			message: {text: message},
		}
	}, function(error, response, body) {
		if (error) {
			console.log('Error sending message: ', error);
		} else if (response.body.error) {
			console.log('Error: ', response.body.error);
		}
	});
};

// takes in text, including eval and perhaps args ___ .
function getCode(text) {
	console.log("IN getCode");
	console.log("text: " + text);

	var text = text || "";
	var values = text.split('\n');
	console.log("values: " + values);

	var options = {}

	if (values[0] === 'eval') {

		var code = "";

		if(values.length == 1) {
			return [];
		}

		if (values[1].split(" ")[0] === 'args') {
			options['args'] = (values[1].substring(5)).split(" ");
			values.splice(0,2);
			code = values.join("\n");
		}
		else {
			values.splice(0,1);
			code = values.join("\n");
		}

		return [code, options];

	}

	return [];
}

function evalMessage(recipientId, text) {
	infoArr = getCode(text);
	code = infoArr[0];
	options = infoArr[1];
	evalCode(code, options, recipientId);

};

function evalCode(code, options, callback) {

	var finished = false;
	var timedOut = false;

	console.log("CODE: " + code);

	fs.writeFile("my_script.py", code, function(err) {
		if(err) {
			// sendMessage(recipientId, {text: "Sorry, an error occured."});
			console.log(err);
			return "";
		}

		var toSend = "before running...";

		PythonShell.run('my_script.py', options, function (err, results) {
			var toSend = "inside run";

			if (err) {
				// sendMessage(recipientId, {text: "Sorry, an error occured."});
				console.log(err);
				return "";
			}
			console.log('results: %j', results);

			if(results === null) {
				callback("");
				return;
			}

			toSend = "";

			for(q = 0; q < results.length; q++) {
				toSend += results[q] + "\n";
			}

			console.log("toSend from eval: " + toSend);
			finished = true;
			if(!timedOut) {
				callback(toSend);
			}
		});
	});

	setTimeout(function() {
		if(!finished) {
			console.log("timed out :(");
			callback("NOTE: Execution timed out.");
			timedOut = true;
		}
	}, 1000);

}


