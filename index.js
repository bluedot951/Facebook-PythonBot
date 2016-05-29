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
			// console.log("in webhook.event.message...");

			// sendMessage(event.sender.id, "Echo: " + event.message);

			var infoArr = getCode(event.message.text);
			var code = infoArr[0];
			var args = infoArr[1];

			// console.log("webhook...code: " + code);
			// console.log("----webhook...code")
			// console.log("webhook...args: ");
			// console.log(args);
			// console.log("----webhook...args")

			sendMessage(event.sender.id, "Evaluating the following Python code:\n```python\n" + code);


			evalCode(code, args, function processOutput(output) {
				// console.log("webhook...output: " + output);
				// console.log("---webhook...output");


				if(output.length > 300) {
					// console.log("LONGER THAN 300!!");
					var reploutput = output.split("\n").join("\\n");

					var formData = "{ \"description\": \"the description for this gist\", \"public\": true, \"files\": { \"file1.txt\": { \"content\": \"" + reploutput + "\" } } }";
					console.log("Sending formdata to github...");
					console.log(formData);
					console.log("end formdata");

					request.post(
					{
						url:'https://api.github.com/gists',
						form: formData,
						headers: {
							'User-Agent': 'fbbot request'
						}
					}, 
					function(error,httpResponse,body){
						// console.log("body below:")
						// console.log(body);
						// console.log("body above");
						var myurl = JSON.parse(body).files['file1.txt']['raw_url'];
						// console.log(myurl);

						var shortOutput = output.substring(0, 100);
						var shorturlform = "url=" + myurl;

						request.post(
						{
							url:'https://git.io/',
							form: shorturlform,
						}, 
						function(err,httpResponse,body){
							var shorturl = httpResponse.caseless.dict.location;
								
							var toSend = shortOutput + "\nOutput clipped.\nFull output can be found at: " + shorturl;

							sendMessage(event.sender.id, toSend);	
							prevCode[event.sender.id + ""] = [code, args];

							sendStructuredMessage(event.sender.id);

						}
						);


					});

				}

				else {
					sendMessage(event.sender.id, output);	
					prevCode[event.sender.id + ""] = [code, args];

					sendStructuredMessage(event.sender.id);
				}



			});
		}
		else if (event.postback) {
			// console.log("Postback received: " + JSON.stringify(event.postback));
			// console.log(prevCode);
			// console.log("postback: " + JSON.stringify(event.postback));
			// console.log("payload: " + event.postback['payload']);
			// console.log("in prevCode: " + prevCode[event.postback['payload']]);
			infoArr = prevCode[event.postback['payload']];

			var code = infoArr[0];
			var args = infoArr[1];

			sendMessage(event.sender.id, "Evaluating the following Python code:\n```python\n" + code);

			evalCode(code, args, function processOutput(output) {
				// console.log("webhook...output: " + output);
				// console.log("---webhook...output");




				sendMessage(event.sender.id, output);	

				sendStructuredMessage(event.sender.id);

			});

		}

	}
	res.sendStatus(200);
});

function makeGist(data) {

}

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

// console.log("in send structuted message!");

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
		// console.log('Error sending message: ', error);
	} else if (response.body.error) {
		// console.log('Error: ', response.body.error);
	}
});
};

function sendMessage(recipientId, message) {
	// console.log("in send message!");
	// console.log(message);

	// console.log({
	// 	url: 'https://graph.facebook.com/v2.6/me/messages',
	// 	qs: {access_token: process.env.PAGE_ACCESS_TOKEN},
	// 	method: 'POST',
	// 	json: {
	// 		recipient: {id: recipientId},
	// 		message: {text: message},
	// 	}
	// });

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
			// console.log('Error sending message: ', error);
		} else if (response.body.error) {
			// console.log('Error: ', response.body.error);
		}
	});
};

// takes in text, including eval and perhaps args ___ .
function getCode(text) {
	// console.log("IN getCode");
	// console.log("text: " + text);

	var text = text || "";
	var values = text.split('\n');
	// console.log("values: " + values);

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

	// console.log("CODE: " + code);

	fs.writeFile("my_script.py", code, function(err) {
		if(err) {
			// sendMessage(recipientId, {text: "Sorry, an error occured."});
			// console.log("FILE CREATION ERROR... below:");
			// console.log(err);
			// console.log("FILE CREATION ERROR... above.")
			return "";
		}

		var toSend = "before running...";

		PythonShell.run('my_script.py', options, function (err, results) {
			var toSend = "inside run";

			if (err) {
				// sendMessage(recipientId, {text: "Sorry, an error occured."});
				// console.log("PYTHON ERROR... below:");
				// console.log(err.stack);
				// console.log("PYTHON ERROR... above.");
				errormsg = "An error occured. The stack trace is:\n" + err.stack;
				replacederrormsg = errormsg.split("\n").join("\\n");
				finished = true;
				if(!timedOut) {
					// callback(errormsg);
					console.log("SENDNING MODIFIED ERROR MSG");
					callback("An error occured. The stack trace is:\nError: ZeroDivisionError: integer division or modulo by zero\n    at PythonShell.parseError (/app/node_modules/python-shell/index.js:183:17)\n    at terminateIfNeeded (/app/node_modules/python-shell/index.js:98:28)\n    at ChildProcess.<anonymous> (/app/node_modules/python-shell/index.js:88:9)\n    at emitTwo (events.js:100:13)\n    at ChildProcess.emit (events.js:185:7)\n    at Process.ChildProcess._handle.onexit (internal/child_process.js:204:12)\n    ----- Python Traceback");
					// callback("An error occured in your code.");
				}
				// callback(replacederrormsg);
				return;
			}
			// console.log('results: %j', results);

			if(results === null) {
				callback("");
				return;
			}

			toSend = "";

			for(q = 0; q < results.length; q++) {
				toSend += results[q] + "\n";
			}

			// console.log("toSend from eval: " + toSend);
			finished = true;
			if(!timedOut) {
				callback(toSend);
			}
		});
	});

	setTimeout(function() {
		if(!finished) {
			// console.log("timed out :(");
			callback("NOTE: Execution timed out.");
			timedOut = true;
		}
	}, 1000);

}


