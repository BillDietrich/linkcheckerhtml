//------------------------------------------------------------------------------
// extension.ts

//------------------------------------------------------------------------------

// Some things from 'vscode', which contains the VS Code extensibility API
import {
    workspace,
    window,
    commands,
    languages,
    Diagnostic,
    DiagnosticSeverity,
    DiagnosticCollection,
	ExtensionContext,
    Range,
    OutputChannel,
    Position,
	ProgressLocation,
    Uri,
    Disposable,
    TextDocument,
    TextLine,
    StatusBarItem,
	StatusBarAlignment,
	WorkspaceConfiguration
	} from 'vscode';

import fs = require('fs');
// For checking relative URIs against the local file system
import path = require('path');

// For accessing internet URIs
// https://www.npmjs.com/package/axios
// https://github.com/axios/axios
import {
	AxiosPromise,
	AxiosRequestConfig,
	AxiosResponse,
	CancelToken
	} from 'axios';
const axios = require('axios');

const torreq = require('tor-request');	// https://www.npmjs.com/package/tor-request

const torcon = require('tor-control');	// https://www.npmjs.com/package/tor-control
var torcontrol = null;

const arrayBufferToHex = require('array-buffer-to-hex')

//Interface for links
interface Link {
    text: string
    address: string
    lineText: TextLine
	bDoHTTPSForm: boolean	// address is HTTP, but check HTTPS form of it
}


//------------------------------------------------------------------------------

var myStatusBarItem: StatusBarItem = null;
var gDiagnosticsCollection: DiagnosticCollection = null;
var gDiagnosticsArray: Array<Diagnostic> = null;
var gConfiguration: WorkspaceConfiguration = null;
var gDocument = null;
var gStartingNLinks: number = 0;
var gnTimeout: number = 15;	// seconds
var gbCheckInternalLinks: boolean = true;
var gbProcessIdAttributeInAnyTag: boolean = true;
var gsAddExtensionToLocalURLsWithNone: string = "";
var gbDone: boolean = true;
var gbCancelled: boolean = false;

var gLocalAnchorNames: Array<string> = null;
var gaDontCheck: Array<string> = null;

var gnMaxParallelThreads: number = 0;

var gbReportBadChars: boolean = true;
var gBadCharsSeverity: DiagnosticSeverity = DiagnosticSeverity.Information;
var gsPatternBadChars: string = "";

var gsReportBadChars = "E";

var gbReportPossibleMistakes: boolean = true;
var gPossibleMistakesSeverity: DiagnosticSeverity = DiagnosticSeverity.Information;
var gaPatternPossibleMistakes: Array<string> = null;

var gbReportHTTPSAvailable: boolean = true;
var gHTTPSAvailableSeverity: DiagnosticSeverity = DiagnosticSeverity.Information;

var gsReportRedirects: string = "";
var gReportRedirectSeverity: DiagnosticSeverity = DiagnosticSeverity.Error;

var gbReportSemanticErrors: boolean = true;
var gsReportSemanticErrors: string = "";
var gSemanticSeverity: DiagnosticSeverity = DiagnosticSeverity.Information;

var gsUserAgent: string = "";

var gsLocalRoot: string = "";

var gbCheckMailtoDestFormat: boolean = true;

var gsReportNonHandledSchemes = "";
var gReportNonHandledSchemesSeverity: DiagnosticSeverity = DiagnosticSeverity.Error;

//var //gOutputChannel: OutputChannel = null;	// remove comment chars to do debugging


//------------------------------------------------------------------------------

// This method is called when your extension is activated.
// Your extension is activated the very first time the command is executed.

export function activate(extensionContext:ExtensionContext) {
    
	//gOutputChannel = window.createOutputChannel("linkcheckerhtml");
    // Show the output channel
    //gOutputChannel.show(false);	// preserveFocus === false
    //gOutputChannel.appendLine(`activate: active`);
	//gOutputChannel.appendLine(`activate: uri = ${window.activeTextEditor.document.uri.toString()}`);

	myStatusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, 0);
	extensionContext.subscriptions.push(myStatusBarItem);
	myStatusBarItem.hide();

	gDiagnosticsCollection = languages.createDiagnosticCollection("linkcheckerhtml");
	extensionContext.subscriptions.push(gDiagnosticsCollection);

    let disposable1 = commands.registerCommand('extension.generateLinkReport', generateLinkReport);
	extensionContext.subscriptions.push(disposable1);

    let disposable2 = commands.registerCommand('extension.openURL', openURL);
	extensionContext.subscriptions.push(disposable2);

    let disposable3 = commands.registerCommand('extension.openURLasHTTPS', openURLasHTTPS);
	extensionContext.subscriptions.push(disposable3);

    let disposable4 = commands.registerCommand('extension.clearDiagnostics', clearDiagnostics);
	extensionContext.subscriptions.push(disposable4);

    //gOutputChannel.appendLine(`activate: finished`);
}

// this method is called when your extension is deactivated
export function deactivate() {
	// delete any OS resources you allocated that are not
	// included in extensionContext.subscriptions
}



//------------------------------------------------------------------------------
// from https://github.com/GabiGrin/vscode-auto-run-command/blob/master/src/lib/run-shell-command.ts

const runShellCommand = async (command: string): Promise<any> => {
    const { exec } = require('child_process');

	//gOutputChannel.appendLine(`runShellCommand: called, command "${command}"`);

    return new Promise((resolve, reject) => {
        exec(command, (error, _, stderr) => {
            if (error) {
				// we get here if xdotool can't find the window specified
				//gOutputChannel.appendLine(`runShellCommand: error "${error}"`);
                reject(error);
				return;
            }
            if (stderr) {
				//gOutputChannel.appendLine(`runShellCommand: stderr "${stderr}"`);
                reject(stderr);
				return;
            }
            resolve(null);
        });
    });
}


//------------------------------------------------------------------------------

// Open an onion URL in Tor browser.

export function openOnionURL(sURL: string) {
    //gOutputChannel.appendLine(`openOnionURL: called, sURL '${sURL}'`);

/*
	// METHOD 1: use tor-control
	//
	// see "man tor"
	// to find out what config file is being used, do "tor --verify-config"
	//
	// any time you change /etc/tor/torrc, do "sudo systemctl restart tor"
	// then check "sudo journalctl --pager-end" and "sudo ss -lptu" see listener on 9051
	//
	// for debugging, un-comment "Log debug file /var/log/tor/debug.log" in /etc/tor/torrc
	// but you will get a TON of output
	//
	// if HashedControlPassword is set or CookieAuthentication == 1 in /etc/tor/torrc,
	// file /run/tor/control.authcookie gets rewritten every time you start Tor service
	//
	// file /var/lib/tor/control_auth_cookie gets rewritten when ???

	// sudo chmod a+rx /var/lib/tor ; sudo chmod a+r /var/lib/tor/control_auth_cookie ; sudo chmod a+r /run/tor/control.authcookie

	fs.readFile(
			//'/var/lib/tor/control_auth_cookie',	// for browser
			'/run/tor/control.authcookie',	// for socks service
			(err, data) => {
		if (err) {
			//gOutputChannel.appendLine(`openOnionURL.readFile: err "${err}"`);
			return;
		}
		//gOutputChannel.appendLine(`openOnionURL.readFile: data bytelength ${data.byteLength}`);
		const datahex = arrayBufferToHex(data);
		//gOutputChannel.appendLine(`openOnionURL.readFile: datahex "${datahex}"`);

		//torcontrol = new torcon({host:"127.0.0.1", port:9051, password:datahex, persistent:true});
		torcontrol = new torcon({host:"127.0.0.1", port:9051, password:"giraffe"});
		//torcontrol = new torcon({host:"127.0.0.1", port:9151, persistent:true});
		//torcontrol.TorControlPort.password = 'giraffe';
		// note: Tor Browser log (hamburger / Preferences / General / View Log) uses time-zone of exit relay !
		// in Tor Browser log, always get "[NOTICE] New control connection opened from 127.0.0.1."
		//							and   "[WARN] Bad password or authentication cookie on controller."
		// "Error: Authentication failed with message: 515 Authentication failed: Password did not match HashedControlPassword *or* authentication cookie."
		//gOutputChannel.appendLine(`openOnionURL: past new tor-control`);
		// hash of "giraffe": 16:4F736B69E8F24708602DE20EE4801AFCC191DB13CDF700CB3D31BA23E6
		// hash of giraffe: 16:95CD14D0F828911A60E28E633759E6866FE86E526B692EDFCD0DEC6DB9
		// https://gitweb.torproject.org/torspec.git/tree/control-spec.txt
		// support.torproject.org/#connectingtotor
		// https://tor.stackexchange.com/questions/15098/wrong-password-when-using-system-installed-tor-with-tor-browser
		// https://trac.torproject.org/projects/tor/wiki/TorBrowserBundleSAQ
		// https://2019.www.torproject.org/docs/tor-manual.html.en
		// https://www.codeproject.com/articles/1072864/tor-net-a-managed-tor-network-library
		//torcontrol.connect();
		////gOutputChannel.appendLine(`openOnionURL: past connect`);

		torcontrol.getInfo(
			['version', 'exit-policy/ipv4'],
			function (err, res) {
				//gOutputChannel.appendLine(`openOnionURL.callback:  torcon.getInfo gave err "${err}", res "${res}"`);
				if (!err) {
					//gOutputChannel.appendLine(`openOnionURL.callback:  res.code ${res.code}, res.message ${res.message}, res.data ${res.data}`);
					////gOutputChannel.appendLine(`openOnionURL: res ${JSON.stringify(res)}`);
				} else {
					//gOutputChannel.appendLine(`openOnionURL.callback: err "${err}"`);
					////gOutputChannel.appendLine(`openOnionURL: err ${JSON.stringify(err)}`);
					//gOutputChannel.appendLine(`openOnionURL: res ${JSON.stringify(res)}`);
				}
				torcontrol.disconnect();
				//gOutputChannel.appendLine(`openOnionURL.callback: past disconnect`);
				torcontrol = null;
			}
		);
		//gOutputChannel.appendLine(`openOnionURL: past getInfo`);

		//torcontrol.sendCommand(
		//	"SHUTDOWN",
		//	function (err, res) {
		//		//gOutputChannel.appendLine(`openOnionURL.callback:  torcon.sendCommand gave err "${err}", res "${res}"`);
		//		if (!err) {
		//			//gOutputChannel.appendLine(`openOnionURL.callback:  res.code ${res.code}, res.message ${res.message}, res.data ${res.data}`);
		//			////gOutputChannel.appendLine(`openOnionURL: res ${JSON.stringify(res)}`);
		//		} else {
		//			//gOutputChannel.appendLine(`openOnionURL.callback: err "${err}"`);
		//			////gOutputChannel.appendLine(`openOnionURL: err ${JSON.stringify(err)}`);
		//			//gOutputChannel.appendLine(`openOnionURL: res ${JSON.stringify(res)}`);
		//		}
		//		torcontrol.disconnect();
		//		//gOutputChannel.appendLine(`openOnionURL.callback: past disconnect`);
		//		torcontrol = null;
		//	}
		//);
		////gOutputChannel.appendLine(`openOnionURL: past sendCommand`);

		//torcontrol.disconnect();
		////gOutputChannel.appendLine(`openOnionURL: past new disconnect`);
		//torcontrol = null;
	})

	// METHOD 2: launch Tor Browser from command-line with --new-tab option
	// gave up, launching is ridiculously contorted, at least on Linux
	// and for example, the GNOME desktop file to launch Tor Browser is self-rewriting !

	// METHOD 3: Define a new URL protocol type in the desktop.
	// but you'd have to rewrite the URL, and Tor would get an URL it couldn't handle
	// And you end up same problems as method 2.

	// METHOD 4: D-Bus ?  Didn't try.
	// https://dbus.freedesktop.org/doc/dbus-tutorial.html
	// https://github.com/Shouqun/node-dbus
	// https://www.npmjs.com/package/dbus
	// https://github.com/sidorares/dbus-native
	// https://stackoverflow.com/questions/21440589/node-dbus-native
*/

	// METHOD 5: xdotool  (worked on Linux, then stopped working !)
	// https://www.faqforge.com/linux/open-new-web-browser-tab-command-line-linux/
	// sudo apt install xdotool
	// man xdotool
	gConfiguration = workspace.getConfiguration('linkcheckerhtml');
	let sCmd1 = gConfiguration.torOpenURLCmd1 + "'" + sURL + "'\"";
	let sCmd2 = gConfiguration.torOpenURLCmd2;
	//let sCmd2 = "sleep 1";

	var p1 = runShellCommand(sCmd1);
	p1.then(() => {
			//gOutputChannel.appendLine(`openOnionURL.p1.then: success`);
			if (sCmd2.length > 0) {
				var p2 = runShellCommand(sCmd2);
				p2.then(() => {
						//gOutputChannel.appendLine(`openOnionURL.p2.then: success`);
					})
					.catch(error => {
						//gOutputChannel.appendLine(`openOnionURL.p2.then: error ${error}`);
					})
			}
		})
		.catch(error => {
			//gOutputChannel.appendLine(`openOnionURL.p1.then: error ${error}`);
		});

/*
	// METHOD 6: xdotool a different way
	const cp = require('child_process')
	cp.exec(sCmd1, (err, stdout, stderr) => {
		//gOutputChannel.appendLine('openOnionURL.1.stdout: ' + stdout);
		//gOutputChannel.appendLine('openOnionURL.1.stderr: ' + stderr);
		if (err) {
			//gOutputChannel.appendLine('openOnionURL.1.error: ' + err);
		} else {
			cp.exec(sCmd2, (err, stdout, stderr) => {
				//gOutputChannel.appendLine('openOnionURL.2.stdout: ' + stdout);
				//gOutputChannel.appendLine('openOnionURL.2.stderr: ' + stderr);
				if (err) {
					//gOutputChannel.appendLine('openOnionURL.2.error: ' + err);
				}
			});
		}
	});
*/

//gOutputChannel.appendLine(`openOnionURL: returning`);
}


//------------------------------------------------------------------------------

// Open normal (non-Onion) URL in browser.

export function openNormalURL(sURL: string) {
    //gOutputChannel.appendLine(`openNormalURL: called, sURL '${sURL}'`);

	//gOutputChannel.appendLine(`openNormalURL: call vscode.open, sURL '${sURL}'`);
	commands.executeCommand('vscode.open', Uri.parse(sURL));	// ignores local files

    //gOutputChannel.appendLine(`openNormalURL: returning`);
}


//------------------------------------------------------------------------------

// Open current selected URL in browser.

export function openURL() {
    //gOutputChannel.appendLine(`openURL: called`);
	let editor = window.activeTextEditor;
	if (!editor) return;
	let selection = editor.selection;
	if (!selection) return;
	let sURL = editor.document.getText(selection);
	//let sURL = "https://3g22222222222222.onion/";

	// want to move cursor from diagnostics pane to editor pane
	// but can't figure out how to do it
	//window.showTextDocument(editor);
	//workbench.action.navigateToLastEditLocation

	if (isOnionLink(sURL)) {
		openOnionURL(sURL);
	} else {
		openNormalURL(sURL);
	}

    //gOutputChannel.appendLine(`openURL: returning`);
}


// Open current selected HTTP URL as HTTPS URL in browser.

export function openURLasHTTPS() {
    //gOutputChannel.appendLine(`openURLasHTTPS: called`);
	let editor = window.activeTextEditor;
	if (!editor) return;
	let selection = editor.selection;
	if (!selection) return;
	let sURL = editor.document.getText(selection);
	
	if (isPlainHttpLink(sURL)) {
		var sURLasHTTPS = sURL.slice(0, 4) + "s" + sURL.slice(4);

		// want to move cursor from diagnostics pane to editor pane
		// but can't figure out how to do it
		//window.showTextDocument(editor);
		//workbench.action.navigateToLastEditLocation

		if (isOnionLink(sURLasHTTPS)) {
			openOnionURL(sURLasHTTPS);
		} else {
			openNormalURL(sURLasHTTPS);
		}
	}
}


//------------------------------------------------------------------------------

// Clear all diagnostics belonging to this extension.

export function clearDiagnostics() {
    //gOutputChannel.appendLine(`clearDiagnostics: called`);

	// should free old array ?  or dispose() on the collection ?
	gDiagnosticsArray = new Array<Diagnostic>();
	gDiagnosticsCollection.set(gDocument.uri,gDiagnosticsArray);
}


//------------------------------------------------------------------------------

// Read configuration values into global variables.

export function readConfiguration() {

    //gOutputChannel.appendLine(`readConfiguration: called`);

	gConfiguration = workspace.getConfiguration('linkcheckerhtml');

	gnMaxParallelThreads = gConfiguration.maxParallelThreads;
	if (gnMaxParallelThreads < 1)
		gnMaxParallelThreads = 1;
	if (gnMaxParallelThreads > 20)
		gnMaxParallelThreads = 20;

	gnTimeout = gConfiguration.timeout;
	if (gnTimeout < 5)
		gnTimeout = 5;
	if (gnTimeout > 30)
		gnTimeout = 30;

	gbCheckInternalLinks = gConfiguration.checkInternalLinks;
	gbProcessIdAttributeInAnyTag = gConfiguration.processIdAttributeInAnyTag;
	gsAddExtensionToLocalURLsWithNone = gConfiguration.addExtensionToLocalURLsWithNone;
	//gsAddExtensionToLocalURLsWithNone = "html";		// TEST ONLY

	gsReportBadChars = gConfiguration.reportBadChars;
	//gOutputChannel.appendLine(`readConfiguration: gsReportBadChars '${gsReportBadChars}'`);
	// as Error, as Warning, as Information, Don't check and report
	gBadCharsSeverity = DiagnosticSeverity.Information;
	switch (gsReportBadChars[3]) {
		case 'E': gBadCharsSeverity = DiagnosticSeverity.Error; break;
		case 'W': gBadCharsSeverity = DiagnosticSeverity.Warning; break;
		case 'I': gBadCharsSeverity = DiagnosticSeverity.Information; break;
		case 'H': gBadCharsSeverity = DiagnosticSeverity.Hint; break;
	}
	gsPatternBadChars = gConfiguration.patternBadChars;

	let sReportPossibleMistakes = gConfiguration.reportPossibleMistakes;
	//gOutputChannel.appendLine(`readConfiguration: sReportPossibleMistakes '${sReportPossibleMistakes}'`);
	// as Error, as Warning, as Information, Don't check and report
	gbReportPossibleMistakes = false;
	switch (sReportPossibleMistakes[3]) {
		case 'E':
		case 'W':
		case 'I':
		case 'H':
				gbReportPossibleMistakes = true;
				break;
	}
	//gOutputChannel.appendLine(`readConfiguration: gbReportPossibleMistakes ${gbReportPossibleMistakes}`);
	gPossibleMistakesSeverity = DiagnosticSeverity.Information;
	switch (sReportPossibleMistakes[3]) {
		case 'E': gPossibleMistakesSeverity = DiagnosticSeverity.Error; break;
		case 'W': gPossibleMistakesSeverity = DiagnosticSeverity.Warning; break;
		case 'I': gPossibleMistakesSeverity = DiagnosticSeverity.Information; break;
		case 'H': gPossibleMistakesSeverity = DiagnosticSeverity.Hint; break;
	}

	let sPatternsPossibleMistakes = gConfiguration.patternsPossibleMistakes;
	//gOutputChannel.appendLine(`readConfiguration: sPatternsPossibleMistakes '${sPatternsPossibleMistakes}'`);
	gaPatternPossibleMistakes = new Array<string>();
	var possmists = sPatternsPossibleMistakes.match(/[^\,]+/gi);
	//gOutputChannel.appendLine(`readConfiguration: possmists '${possmists}'`);
	if (possmists) {
		// Iterate over the values found in the comma-separated list
		for (let i = 0; i< possmists.length; i++) {
			// Get the value
			var possmist = possmists[i].match(/[^\,]+/);
			let sValue = possmist[0];
			// Push it to the array
			gaPatternPossibleMistakes.push(sValue);
		}
	}
	//gOutputChannel.appendLine(`readConfiguration: gaPatternPossibleMistakes[0] ${gaPatternPossibleMistakes[0]}`);
	//gOutputChannel.appendLine(`readConfiguration: gaPatternPossibleMistakes[1] ${gaPatternPossibleMistakes[1]}`);
	//gOutputChannel.appendLine(`readConfiguration: gaPatternPossibleMistakes[2] ${gaPatternPossibleMistakes[2]}`);

	let sReportHTTPSAvailable: string = gConfiguration.reportHTTPSAvailable;
	//gOutputChannel.appendLine(`readConfiguration: sReportHTTPSAvailable '${sReportHTTPSAvailable}'`);
	// as Error, as Warning, as Information, Don't check and report
	gbReportHTTPSAvailable = false;
	switch (sReportHTTPSAvailable[3]) {
		case 'E':
		case 'W':
		case 'I':
		case 'H':
				gbReportHTTPSAvailable = true;
				break;
	}
	//gOutputChannel.appendLine(`readConfiguration: gbReportHTTPSAvailable ${gbReportHTTPSAvailable}`);
	gHTTPSAvailableSeverity = DiagnosticSeverity.Information;
	switch (sReportHTTPSAvailable[3]) {
		case 'E': gHTTPSAvailableSeverity = DiagnosticSeverity.Error; break;
		case 'W': gHTTPSAvailableSeverity = DiagnosticSeverity.Warning; break;
		case 'I': gHTTPSAvailableSeverity = DiagnosticSeverity.Information; break;
		case 'H': gHTTPSAvailableSeverity = DiagnosticSeverity.Hint; break;
	}

	let sDontCheckCSL = gConfiguration.dontCheckURLsThatStartWith;
	//gOutputChannel.appendLine(`readConfiguration: sDontCheckCSL '${sDontCheckCSL}'`);
	gaDontCheck = new Array<string>();
	var dontchecks = sDontCheckCSL.match(/[^\,]+/gi);
	//gOutputChannel.appendLine(`readConfiguration: dontchecks '${dontchecks}'`);
	if (dontchecks) {
		// Iterate over the values found in the comma-separated list
		for (let i = 0; i< dontchecks.length; i++) {
			// Get the value
			var dontcheck = dontchecks[i].match(/[^\,]+/);
			let sValue = dontcheck[0];
			// Push it to the array
			gaDontCheck.push(sValue);
		}
	}
	//gOutputChannel.appendLine(`readConfiguration: gaDontCheck[0] ${gaDontCheck[0]}`);
	//gOutputChannel.appendLine(`readConfiguration: gaDontCheck[1] ${gaDontCheck[1]}`);
	//gOutputChannel.appendLine(`readConfiguration: gaDontCheck[2] ${gaDontCheck[2]}`);

	gsReportRedirects = gConfiguration.reportRedirects;
	gReportRedirectSeverity = DiagnosticSeverity.Information;
	switch (gsReportRedirects[3]) {
		case 'E': gReportRedirectSeverity = DiagnosticSeverity.Error; break;
		case 'W': gReportRedirectSeverity = DiagnosticSeverity.Warning; break;
		case 'I': gReportRedirectSeverity = DiagnosticSeverity.Information; break;
		case 'H': gReportRedirectSeverity = DiagnosticSeverity.Hint; break;
	}
	//gOutputChannel.appendLine(`readConfiguration: gsReportRedirects ${gsReportRedirects}`);

	gsReportSemanticErrors = gConfiguration.reportSemanticErrors;
	gSemanticSeverity = DiagnosticSeverity.Information;
	switch (gsReportSemanticErrors[3]) {
		case 'E': gSemanticSeverity = DiagnosticSeverity.Error; break;
		case 'W': gSemanticSeverity = DiagnosticSeverity.Warning; break;
		case 'I': gSemanticSeverity = DiagnosticSeverity.Information; break;
		case 'H': gSemanticSeverity = DiagnosticSeverity.Hint; break;
	}
	//gOutputChannel.appendLine(`readConfiguration: gsReportSemanticErrors ${gsReportSemanticErrors}`);

	gbReportSemanticErrors = false;
	switch (gsReportSemanticErrors[3]) {
		case 'E':
		case 'W':
		case 'I':
		case 'H':
				gbReportSemanticErrors = true;
				break;
	}

	gsUserAgent = gConfiguration.userAgent;
	//gOutputChannel.appendLine(`readConfiguration: gsUserAgent '${gsUserAgent}'`);

	gsLocalRoot = gConfiguration.localRoot;
	//gOutputChannel.appendLine(`readConfiguration: gsLocalRoot '${gsLocalRoot}'`);

	gbCheckMailtoDestFormat = gConfiguration.checkMailtoDestFormat;
	//gOutputChannel.appendLine(`readConfiguration: gbCheckMailtoDestFormat ${gbCheckMailtoDestFormat}`);

	gsReportNonHandledSchemes = gConfiguration.reportNonHandledSchemes;
	gReportNonHandledSchemesSeverity = DiagnosticSeverity.Information;
	switch (gsReportNonHandledSchemes[3]) {
		case 'E': gReportNonHandledSchemesSeverity = DiagnosticSeverity.Error; break;
		case 'W': gReportNonHandledSchemesSeverity = DiagnosticSeverity.Warning; break;
		case 'I': gReportNonHandledSchemesSeverity = DiagnosticSeverity.Information; break;
		case 'H': gReportNonHandledSchemesSeverity = DiagnosticSeverity.Hint; break;
	}

}


//------------------------------------------------------------------------------

// Generate a report of broken links and the line they occur on.

function generateLinkReport() {

    //gOutputChannel.appendLine(`generateLinkReport: called`);

    // Get the current document
    gDocument = window.activeTextEditor.document;
    //gOutputChannel.appendLine(`generateLinkReport: gDocument.fileName "${gDocument.fileName}"`);
    //gOutputChannel.appendLine(`generateLinkReport: gDocument.languageId "${gDocument.languageId}"`);

	myStatusBarItem.text = `Checking for broken links ...`;
	myStatusBarItem.show();

/*
	// wanted to implement a progress notification dialog, but it
	// wasn't going to behave the way I wanted

	gbDone = false;
	gbCancelled = false;
	window.withProgress({
			location: ProgressLocation.Notification,
			cancellable: true
		}, (progress, token) => {
			//gOutputChannel.appendLine(`generateLinkReport.withProgress: called`);
			token.onCancellationRequested(() => {
			    //gOutputChannel.appendLine(`generateLinkReport.withProgress: got cancel`);
				gbCancelled = true;
			});
			var p = updateProgressDialog(progress);
			//gOutputChannel.appendLine(`generateLinkReport.withProgress: returning`);
			return p;
		}
		);
	
	function updateProgressDialog(progress): Promise<any> {
		//gOutputChannel.appendLine(`updateProgressDialog: called`);

		var p = null;
		if (!gbDone && !gbCancelled) {
			//gOutputChannel.appendLine(`updateProgressDialog: keep going`);
			progress.report({ message: myStatusBarItem.text });
			p = new Promise(resolve => {
				if (!gbDone && !gbCancelled) {
					setTimeout(() => {
						//gOutputChannel.appendLine(`updateProgressDialog: timeout fired`);
						updateProgressDialog(progress)
					}, 1000);
				}
				});
		} else {
			// whoops; want to get rid of the progress dialog here,
			// but turns out the API does not provide for that,
			// user has to close the dialog manually.
		}
		//gOutputChannel.appendLine(`updateProgressDialog: returning`);
		return p;
	}
*/

	clearDiagnostics();

/*
	var diag = new Diagnostic(new Range(new Position(1,10),new Position(2,20)), "message", DiagnosticSeverity.Error);
	gDiagnosticsArray.push(diag);
	gDiagnosticsCollection.set(gDocument.uri,gDiagnosticsArray);
*/

	readConfiguration();

	if (gsReportBadChars[0] != 'D') {
		// scan text for bad characters
		let p4 = checkBadChars(gDocument);
		p4.then((sResult) => {
		    //gOutputChannel.appendLine(`generateLinkReport.p4.then: called`);
		});
	}

	if (gbReportPossibleMistakes) {
		// scan text for possible mistakes
		let p3 = checkPossibleMistakes(gDocument);
		p3.then((sResult) => {
		    //gOutputChannel.appendLine(`generateLinkReport.p3.then: called`);
		});
	}

	if (gbReportSemanticErrors
			&& ((gDocument.languageId == 'html')||(gDocument.languageId == 'php'))) {
		// scan text for possible errors in semantic HTML
		let p5 = scanSemanticHTML(gDocument);
		p5.then((sResult) => {
		    //gOutputChannel.appendLine(`generateLinkReport.p5.then: called`);
		});
	}

	// Possible race-condition if there are no tags to check ?
	// We never wait for p3-p5 to complete.

	gLocalAnchorNames = new Array<string>();

    // Get all links in the document
    var p1 = null;
	switch (gDocument.languageId) {
		case 'html': p1 = getHtmlLinks(gDocument); break;
		case 'php': p1 = getHtmlLinks(gDocument); break;
		case 'xml': p1 = getXmlRssLinks(gDocument); break;
		case 'markdown': p1 = getMarkdownLinks(gDocument); break;
		// apparently RSS gets reported as XML
	}
	p1.then((links: Link[]) => {
		// callback function for the "success" branch of the p1 Promise
		// Promise resolved now, so we're in a different context than before
	    //gOutputChannel.appendLine(`generateLinkReport.p1.then: got ${links.length} links`);

		gStartingNLinks = links.length;
		myStatusBarItem.text = `Checking ${gStartingNLinks} links ...`;
		myStatusBarItem.show();

		let p2 = throttleActions(links, gnMaxParallelThreads);
		p2.then((links) => {
		    //gOutputChannel.appendLine(`generateLinkReport.p2.then: called`);
			gLocalAnchorNames = null;
			myStatusBarItem.text = ``;
			myStatusBarItem.show();
			gbDone = true;
		    //gOutputChannel.appendLine(`generateLinkReport.p2.then: all done`);
		});
	});

    //gOutputChannel.appendLine(`generateLinkReport: returning`);
}


//------------------------------------------------------------------------------

// Performs a list of callable actions (promise factories) so that only a limited
// number of promises are pending at any given time.
//
// Returns A Promise that resolves to the full list of values when everything is done.

function throttleActions(links: Array<Link>, limit: number): Promise<any> {
	//gOutputChannel.appendLine(`throttleActions: called, ${links.length} links, limit ${limit}`);

	// We'll need to store which is the next promise in the list.
	let i = 0;

	// Now define what happens when any of the actions completes. Javascript is
	// (mostly) single-threaded, so only one completion handler will call at a
	// given time. Because we return doNextAction, the Promise chain continues as
	// long as there's an action left in the list.
	function doNextAction() {
		//gOutputChannel.appendLine(`doNextAction: called, ${links.length-i} links left`);

		if (gbCancelled)
			return null;

		if (i < links.length)
			myStatusBarItem.text = `Checking ${gStartingNLinks} links, ${links.length-i} more to do ...`;
		else
			myStatusBarItem.text = `Checking ${gStartingNLinks} links, waiting for last few to complete ...`;
		myStatusBarItem.show();
		
		if (i < links.length) {
			// Save the current value of i, so we can put the result in the right place
			let linkIndex = i++;
			//gOutputChannel.appendLine(`doNextAction: returning`);
			return Promise.resolve(doALink(links[linkIndex]))
				.then(result => {
					//gOutputChannel.appendLine(`doNextAction: result`);
					return null;
				})
				.catch(error => {
					//gOutputChannel.appendLine(`doNextAction: catch4`);
				})
				.then(doNextAction);
		}
	}

	// Now start up the original <limit> number of promises.
	// i advances in calls to doNextAction.
	let listOfPromises = [];
	while (i < limit && i < links.length) {
		listOfPromises.push(doNextAction());
	}

	//gOutputChannel.appendLine(`throttleActions: returning, listOfPromises.length ${listOfPromises.length}`);
	return Promise.all(listOfPromises);
}


//------------------------------------------------------------------------------

function doALink(link: Link): Promise<null> {

	//gOutputChannel.appendLine(`doALink: called, link.address '${link.address}'`);

/*
	var diag = null;
	diag = new Diagnostic(new Range(new Position(1,10),new Position(2,20)), "messageHHHH", DiagnosticSeverity.Error);
	gDiagnosticsArray.push(diag);
	gDiagnosticsCollection.set(gDocument.uri,gDiagnosticsArray);
*/

	//gOutputChannel.appendLine(`doALink: link on line ${link.lineText.lineNumber + 1} is ${link.address}'`);
	let lineNumber = link.lineText.lineNumber;

	var myPromise = null;
	
	// Is it a Tor/onion link?
	if (isOnionLink(link.address)) {
		//gOutputChannel.appendLine(`doALink: onion link address '${link.address}'`);
		var address = link.address;
		let sDomain = getDomainFromOnionLink(address);
		//gOutputChannel.appendLine(`doALink: sDomain '${sDomain}'`);
		if ((sDomain.length != 22) && (sDomain.length != 62)) {
			addDiagnostic(
						lineNumber,
						link.lineText.text.indexOf(sDomain),
						sDomain.length,
						DiagnosticSeverity.Warning,
						`Onion domain '${sDomain}' is wrong length; must be 16 or 56 characters plus '.onion'`
						);
		}
		//gOutputChannel.appendLine(`doALink: onion address '${address}'`);
/*
		torreq.request(
					//'https://api.ipify.org',
					address,
					function (err, res, body) {
						//gOutputChannel.appendLine(`doALink:  torreq.request gave err "${err}", res "${res}"`);
						if (!err) {
							//gOutputChannel.appendLine(`doALink:  res.statusCode ${res.statusCode}`);
							////gOutputChannel.appendLine(`doALink: res ${JSON.stringify(res)}`);
						} else {
							//gOutputChannel.appendLine(`doALink: err "${err}"`);
							////gOutputChannel.appendLine(`doALink: err ${JSON.stringify(err)}`);
						}
					}
			);
*/
		myPromise = new Promise((resolve, reject) => {
			torreq.request(address, true, (err, res, body) => {
				//gOutputChannel.appendLine(`doALink.torreq: returned err "${err}", res "${res}" for "${address}"`);
				//return (err ? reject(err) : resolve(res.statusCode))
				if (err)
					reject(err);
				else
					resolve(res.statusCode);
			});
		});
		myPromise.then(
			(response) =>
		{
			// callback function for the "result" branch of the torreq Promise
			//gOutputChannel.appendLine(`doALink.torreqPromise.then: got response "${response}" for "${link.address}"`);
			if ((response >= 400) && (response < 600)) {
				//gOutputChannel.appendLine(`doALink.torreqPromise.then: ${address} on line ${lineNumber} is unreachable.`);
				addDiagnostic(
							lineNumber,
							link.lineText.text.indexOf(link.address),
							link.address.length,
							DiagnosticSeverity.Error,
							`Onion address '${address}' is unreachable: ${response}`
							);
			}
		},
			(error) =>
		{
			//gOutputChannel.appendLine(`doALink.torreqPromise.then: error: "${error}"  for "${link.address}"`);
			var sError = error.toString();
			if (sError.includes('ECONNREFUSED 127.0.0.1:9050')) {
				sError = "Can't check onion URLs: no Tor/socks service listening on 127.0.0.1:9050";
			}
			addDiagnostic(
						lineNumber,
						link.lineText.text.indexOf(link.address),
						link.address.length,
						DiagnosticSeverity.Error,
						`Onion address '${address}' is not reachable: ${sError}`
						);
		}
		);
	}

	// Is it an HTTP* link or a relative link?
	else if (isHttpLink(link.address)) {
		// And check if they are broken or not.
		var address = link.address;
		if (link.bDoHTTPSForm)
			address = link.address.slice(0, 4) + "s" + link.address.slice(4);
		//gOutputChannel.appendLine(`doALink: address '${address}'`);
		myPromise = axios.get(address,
								{
								validateStatus: null,
								timeout: (gnTimeout * 1000),
								maxRedirects: ((gsReportRedirects[0]!='D') ? 0 : 4),
								headers: {'User-Agent': `${gsUserAgent}`}
								});
		myPromise.then(
			(response) =>
		{
			// callback function for the "result" branch of the axios Promise
			//gOutputChannel.appendLine(`doALink.axiosPromise.then: got response for url ${response.config.url}: ${response.status} (${response.statusText})`);
			//  JSON.stringify(response.request) gives circularity error
			//gOutputChannel.appendLine(`doALink.axiosPromise.then: response.config ${JSON.stringify(response.config)}`);
			//gOutputChannel.appendLine(`doALink.axiosPromise.then: response.headers ${JSON.stringify(response.headers)}`);
			////gOutputChannel.appendLine(`doALink.axiosPromise.then: response.data ${JSON.stringify(response.data)}`);
			//if (response.status === 301) {
			//	//gOutputChannel.appendLine(`doALink.axiosPromise.then: redirected to response.headers.location ${JSON.stringify(response.headers.location)}`);
			//}
			var nIndexOfQuestionMarkInLocation = 0;
			if ((response.status > 300) && (response.status < 400))
				nIndexOfQuestionMarkInLocation = response.headers.location.indexOf("?");
			// as Error, as Warning, as Information, Don't report
			if ((response.status > 400) && (response.status < 600)) {
				//gOutputChannel.appendLine(`doALink.axiosPromise.then: ${link.address} on line ${lineNumber} is unreachable.`);
				if (!link.bDoHTTPSForm) {
					// HTTP form of link, and it's not found
					addDiagnostic(
								lineNumber,
								link.lineText.text.indexOf(link.address),
								link.address.length,
								DiagnosticSeverity.Error,
								`'${address}' is unreachable: ${response.status} (${response.statusText})`
								);
				}
				// else HTTPS form of HTTP link, and it's not found, don't report
			} else if (((response.status > 300) && (response.status < 400))
					&& (response.headers.location === response.config.url)) {
				// response code says it redirected, but in fact old location is same as new location
				// hardly ever get this case, often the new location is just "/", or has "/" or ".html" added
				// do nothing
				//gOutputChannel.appendLine(`doALink.axiosPromise.then: old location matches new location.`);
			} else if (((response.status > 300) && (response.status < 400))
					&& (nIndexOfQuestionMarkInLocation > 0)
					&& (response.headers.location.substring(0,nIndexOfQuestionMarkInLocation) === response.config.url)) {
				// response code says it redirected, but new location is just old location with "?something" appended
				// hardly ever get this case, often new location is different
				// do nothing
				//gOutputChannel.appendLine(`doALink.axiosPromise.then: old location matches new location plus question mark.`);
			} else if ((gsReportRedirects[0]!='D') && ((response.status > 300) && (response.status < 400))) {
				//gOutputChannel.appendLine(`doALink.axiosPromise.then: ${link.address} on line ${lineNumber} redirected.`);
				// redirected to response.headers.location
				//gOutputChannel.appendLine(`doALink.axiosPromise.then: ${response.config.url}`);
				//gOutputChannel.appendLine(`doALink.axiosPromise.then: ${response.config.headers}`);
				if (!link.bDoHTTPSForm) {
					// HTTP form of link, and it redirected
					addDiagnostic(
								lineNumber,
								link.lineText.text.indexOf(link.address),
								link.address.length,
								gReportRedirectSeverity,
								`'${address}' redirects; ${response.status} (${response.statusText})${(response.headers.location ? "; "+response.headers.location : "")}`
								);
				} else {
					// else HTTPS form of HTTP link, and it's found and redirected
					addDiagnostic(
								lineNumber,
								link.lineText.text.indexOf(link.address),
								link.address.length,
								gHTTPSAvailableSeverity,
								`HTTPS form of '${link.address}' is available; ${response.status} (${response.statusText})${(response.headers.location ? "; "+response.headers.location : "")}`
								);
				}
			} else {
				//gOutputChannel.appendLine(`doALink.axiosPromise.then: ${link.address} on line ${lineNumber} is accessible.`);
				if (link.bDoHTTPSForm) {
					// HTTPS form of link, and it is accessible
					addDiagnostic(
								lineNumber,
								link.lineText.text.indexOf(link.address),
								link.address.length,
								gHTTPSAvailableSeverity,
								`HTTPS form of '${link.address}' is available; ${response.status} (${response.statusText})${(response.headers.location ? "; "+response.headers.location : "")}`
								);
				}
			}
		},
			(error) =>
		{
			//gOutputChannel.appendLine(`doALink.axiosPromise.catch0: ${link.address} error: ${error}`);
			addDiagnostic(
						lineNumber,
						link.lineText.text.indexOf(link.address),
						link.address.length,
						DiagnosticSeverity.Error,
						`'${address}' is not reachable: ${error}`
						);
			//gOutputChannel.appendLine(`doALink.axiosPromise.catch0: end`);
		}
		).catch(
			(error) =>
		{
			if (error.response) {
				//gOutputChannel.appendLine(`doALink.axiosPromise.catch1: ${link.address} error: ${error}, response ${error.response}`);
			} else if (error.request) {
				//gOutputChannel.appendLine(`doALink.axiosPromise.catch1: ${link.address} error: ${error}, request ${error.request}`);
			} else {
				//gOutputChannel.appendLine(`doALink.axiosPromise.catch1: ${link.address} error: ${error}}`);
			}
			addDiagnostic(
						lineNumber,
						link.lineText.text.indexOf(link.address),
						link.address.length,
						DiagnosticSeverity.Error,
						`'${address}' isn't reachable: ${error}`
						);
			//gOutputChannel.appendLine(`doALink.axiosPromise.catch1: end`);
		});
	} else {
		if (link.address[0] === '#') {
			// reference to a local anchor definition (#name in this file)
			if (gbCheckInternalLinks) {
				let address = link.address.substr(1);
				if (gLocalAnchorNames.indexOf(address) < 0) {
					// no definition for this link target
 					addDiagnostic(
								lineNumber,
								link.lineText.text.indexOf(link.address),
								link.address.length,
								DiagnosticSeverity.Error,
								`Id or name '${address}' not found in current file.`
								);
				}
			}
		} else if (isNonHTTPLink(link.address)) {
			if (gbCheckMailtoDestFormat && isMailtoLink(link.address)) {
				//gOutputChannel.appendLine(`doALink: Checking mailto link.`);
				if (!isWellFormedMailtoLink(link.address)) {
					addDiagnostic(
								lineNumber,
								link.lineText.text.indexOf(link.address),
								link.address.length,
								DiagnosticSeverity.Error,
								`'${link.address}' is badly-formed.`
								);
				}
			} else {
				// as Error, as Warning, as Information, Don't report
				if (gsReportNonHandledSchemes[0] != 'D') {
					//gOutputChannel.appendLine(`doALink: ${link.address} on line ${lineNumber} is non-HTTP* link; not checked.`);
					addDiagnostic(
								lineNumber,
								link.lineText.text.indexOf(link.address),
								link.address.length,
								gReportNonHandledSchemesSeverity,
								`'${link.address}' is non-HTTP* link; not checked.`
								);
				}
			}
		} else {
			// Must be a relative path, but might not be, so try it...
			try {
				//gOutputChannel.appendLine(`doALink: link.address '${link.address}'`);
				// trim off "? and anything after it
            	var sMatch = link.address.match(/([^?]*)/);
            	var sAddress = sMatch[1];
				// if starts with "/", fix it
				if (sAddress[0] === '/') {
					sAddress = gsLocalRoot + sAddress;
				}
				// Find the directory from the path to the current document
				var currentWorkingDirectory = path.dirname(gDocument.fileName);
				// Use that to resolve the full path from the relative link address
				// The `.split('#')[0]` at the end is so that relative links that also reference an anchor in the document will work with file checking.
				var fullPath = path.resolve(currentWorkingDirectory, sAddress).split('#')[0];
				//gOutputChannel.appendLine(`doALink: link.address '${link.address}' and sAddress '${sAddress}' and currentWorkingDirectory '${currentWorkingDirectory}' gives fullPath '${fullPath}'`);
				if (gsAddExtensionToLocalURLsWithNone.length > 0) {
					// if path does not end with a filename extension, append "." and gsAddExtensionToLocalURLsWithNone
					try {
						var extension = fullPath.match(/[^/\.]\.([^/\.]+)$/);
						//gOutputChannel.appendLine(`doALink: fullPath '${fullPath}' has extension '${extension[1]}'`);
					} catch (error) {
						//gOutputChannel.appendLine(`doALink: fullPath '${fullPath}' has no extension`);
						fullPath = fullPath + "." + gsAddExtensionToLocalURLsWithNone;
						//gOutputChannel.appendLine(`doALink: new fullPath '${fullPath}'`);
					}
				}
				// Check if the file exists and log appropriately
				if (fs.existsSync(fullPath)) {
					//gOutputChannel.appendLine(`doALink: local file ${fullPath} on line ${lineNumber} exists.`);
				} else {
					//gOutputChannel.appendLine(`doALink: local file ${fullPath} on line ${lineNumber} does not exist.`);
					addDiagnostic(
								lineNumber,
								link.lineText.text.indexOf(link.address),
								link.address.length,
								DiagnosticSeverity.Error,
								`Local file '${fullPath}'  does not exist.`
								);
				}
			} catch (error) {
				// If there's an error, log the link
				//gOutputChannel.appendLine(`doALink: ${link.address} on line ${lineNumber} is not an HTTP/s or relative link.`);
			}
		}
	}

    //gOutputChannel.appendLine(`doALink: returning`);
	return myPromise;
}


//------------------------------------------------------------------------------

// Parse the HTML Anchor links out of the document.

function getHtmlLinks(document: TextDocument): Promise<Link[]> {
    //gOutputChannel.appendLine(`getHtmlLinks called, document.uri '${document.uri}'`);
    // Return a promise, since this might take a while for large documents
    return new Promise<Link[]>((resolve, reject) => {
        // Create arrays to hold links as we parse them out
        let linksToReturn = new Array<Link>();
        // Get lines in the document
        let lineCount = document.lineCount;

        
        // Loop over the lines in a document
        for (let lineNumber = 0; lineNumber < lineCount; lineNumber++) {
            // Get the text for the current line
            let lineText = document.lineAt(lineNumber);

            // Are there links?

			// Anchor-href link looks like: <a ... href="urlhere" ... >
            var links = lineText.text.match(/<a[^>]*\shref="[^"]*"/gi);
            if (links) {
                // Iterate over the links found on this line
                for (let i = 0; i< links.length; i++) {
                    // Get the URL from each individual link
                    var link = links[i].match(/<a[^>]*\shref="([^"]*)"/);
                    let address = link[1];
					if (!DontCheck(address)) {
						// Push it to the array
						linksToReturn.push({
							text: link[0],
							address: address,
							lineText: lineText,
							bDoHTTPSForm: false
						});
						if (gbReportHTTPSAvailable && isPlainHttpLink(address)) {
							// add HTTPS form of it to array also
							linksToReturn.push({
								text: link[0],
								address: address,
								lineText: lineText,
								bDoHTTPSForm: true
							});
						}
					}
                }
            }

			// Anchor-name definition looks like: <a ... name="urlhere" ... >
            var links = lineText.text.match(/<a[^>]*\sname="[^"]*"/gi);
            if (links) {
                // Iterate over the links found on this line
                for (let i = 0; i< links.length; i++) {
                    // Get the URL from each individual link
                    var link = links[i].match(/<a[^>]*\sname="([^"]*)"/);
                    let address = link[1];
					if (gLocalAnchorNames.indexOf(address) >= 0) {
						// duplicate definition
						addDiagnostic(
									lineNumber,
									lineText.text.indexOf(address),
									address.length,
									DiagnosticSeverity.Error,
									`Duplicate definition of '${address}'.`
									);
					} else {
						// new definition
                    	// Push it to the array
                    	gLocalAnchorNames.push(address);
					}
                }
            }

			if (gbProcessIdAttributeInAnyTag) {
				// tag-id definition looks like: < ... id="urlhere" ... >
				var links = lineText.text.match(/<[^>]*\sid="[^"]*"/gi);
				if (links) {
					// Iterate over the links found on this line
					for (let i = 0; i< links.length; i++) {
						// Get the URL from each individual link
						var link = links[i].match(/<[^>]*\sid="([^"]*)"/);
						let address = link[1];
						if (gLocalAnchorNames.indexOf(address) >= 0) {
							// duplicate definition
							addDiagnostic(
										lineNumber,
										lineText.text.indexOf(address),
										address.length,
										DiagnosticSeverity.Error,
										`Duplicate definition of '${address}'.`
										);
						} else {
							// new definition
							// Push it to the array
							gLocalAnchorNames.push(address);
						}
					}
				}
			} else {
				// Anchor-id (HTML5) definition looks like: <a ... id="urlhere" ... >
				var links = lineText.text.match(/<a[^>]*\sid="[^"]*"/gi);
				if (links) {
					// Iterate over the links found on this line
					for (let i = 0; i< links.length; i++) {
						// Get the URL from each individual link
						var link = links[i].match(/<a[^>]*\sid="([^"]*)"/);
						let address = link[1];
						if (gLocalAnchorNames.indexOf(address) >= 0) {
							// duplicate definition
							addDiagnostic(
										lineNumber,
										lineText.text.indexOf(address),
										address.length,
										DiagnosticSeverity.Error,
										`Duplicate definition of '${address}'.`
										);
						} else {
							// new definition
							// Push it to the array
							gLocalAnchorNames.push(address);
						}
					}
				}
			}

			// Img-src link looks like: <img ... src="urlhere" ... >
            links = lineText.text.match(/<img[^>]*\ssrc="[^"]*"/gi);
            if (links) {
                // Iterate over the links found on this line
                for (let i = 0; i< links.length; i++) {
                    // Get the URL from each individual link
                    var link = links[i].match(/<img[^>]*\ssrc="([^"]*)"/);
                    let address = link[1];
					if (!DontCheck(address)) {
						// Push it to the array
						linksToReturn.push({
							text: link[0],
							address: address,
							lineText: lineText,
							bDoHTTPSForm: false
						});
						if (gbReportHTTPSAvailable && isPlainHttpLink(address)) {
							// add HTTPS form of it to array also
							linksToReturn.push({
								text: link[0],
								address: address,
								lineText: lineText,
								bDoHTTPSForm: true
							});
						}
					}
                }
            }

			// Script-src link looks like: <script ... src="urlhere" ... >
            links = lineText.text.match(/<script[^>]*\ssrc="[^"]*"/gi);
            if (links) {
                // Iterate over the links found on this line
                for (let i = 0; i< links.length; i++) {
                    // Get the URL from each individual link
                    var link = links[i].match(/<script[^>]*\ssrc="([^"]*)"/);
                    let address = link[1];
					if (!DontCheck(address)) {
						// Push it to the array
						linksToReturn.push({
							text: link[0],
							address: address,
							lineText: lineText,
							bDoHTTPSForm: false
						});
						if (gbReportHTTPSAvailable && isPlainHttpLink(address)) {
							// add HTTPS form of it to array also
							linksToReturn.push({
								text: link[0],
								address: address,
								lineText: lineText,
								bDoHTTPSForm: true
							});
						}
					}
                }
            }
			
			// Link-href link looks like: <link ... href="urlhere" ... >
            links = lineText.text.match(/<link[^>]*\shref="[^"]*"/gi);
            if (links) {
                // Iterate over the links found on this line
                for (let i = 0; i< links.length; i++) {
                    // Get the URL from each individual link
                    var link = links[i].match(/<link[^>]*\shref="([^"]*)"/);
                    let address = link[1];
					if (!DontCheck(address)) {
						// Push it to the array
						linksToReturn.push({
							text: link[0],
							address: address,
							lineText: lineText,
							bDoHTTPSForm: false
						});
						if (gbReportHTTPSAvailable && isPlainHttpLink(address)) {
							// add HTTPS form of it to array also
							linksToReturn.push({
								text: link[0],
								address: address,
								lineText: lineText,
								bDoHTTPSForm: true
							});
						}
					}
                }
            }
        }
	    //gOutputChannel.appendLine(`getHtmlLinks promise returning, linksToReturn.length ${linksToReturn.length}`);
        if (linksToReturn.length > 0) {
            //Return the populated array, which completes the promise.
            resolve(linksToReturn);
        } else {
			myStatusBarItem.text = ``;
			myStatusBarItem.show();
			gbDone = true;
            //Reject, because we found no links
            reject;
        }
    }).catch();
}


//------------------------------------------------------------------------------

// Parse the links out of an XML or RSS document.
//
// It's very permissive, because XML doesn't really define standard tag and
// attribute names.  So it allows known stuff from RSS, and likely stuff
// that could be in XML.

function getXmlRssLinks(document: TextDocument): Promise<Link[]> {
    //gOutputChannel.appendLine(`getXmlRssLinks called, document.uri '${document.uri}'`);
    // Return a promise, since this might take a while for large documents
    return new Promise<Link[]>((resolve, reject) => {
        // Create arrays to hold links as we parse them out
        let linksToReturn = new Array<Link>();
        // Get lines in the document
        let lineCount = document.lineCount;
        
        //Loop over the lines in a document
        for (let lineNumber = 0; lineNumber < lineCount; lineNumber++) {
            // Get the text for the current line
            let lineText = document.lineAt(lineNumber);

            // Are there links?

			// Atom-href link looks like: <atom:link href="urlhere" ... >
			// XLink-href link looks like: <... xlink:href="urlhere" ... >
			// just accept any kind of href="urlhere"
            var links = lineText.text.match(/href="[^"]*"/gi);
            if (links) {
                // Iterate over the links found on this line
                for (let i = 0; i< links.length; i++) {
                    // Get the URL from each individual link
                    var link = links[i].match(/href="([^"]*)"/);
                    let address = link[1];
					if (!DontCheck(address)) {
						// Push it to the array
						linksToReturn.push({
							text: link[0],
							address: address,
							lineText: lineText,
							bDoHTTPSForm: false
						});
						if (gbReportHTTPSAvailable && isPlainHttpLink(address)) {
							// add HTTPS form of it to array also
							linksToReturn.push({
								text: link[0],
								address: address,
								lineText: lineText,
								bDoHTTPSForm: true
							});
						}
					}
                }
            }

			// Enclosure-url link looks like: <enclosure url="urlhere" ... >
			// just accept any kind of url="urlhere"
            var links = lineText.text.match(/url="[^"]*"/gi);
            if (links) {
                // Iterate over the links found on this line
                for (let i = 0; i< links.length; i++) {
                    // Get the URL from each individual link
                    var link = links[i].match(/url="([^"]*)"/);
                    let address = link[1];
					if (!DontCheck(address)) {
						// Push it to the array
						linksToReturn.push({
							text: link[0],
							address: address,
							lineText: lineText,
							bDoHTTPSForm: false
						});
						if (gbReportHTTPSAvailable && isPlainHttpLink(address)) {
							// add HTTPS form of it to array also
							linksToReturn.push({
								text: link[0],
								address: address,
								lineText: lineText,
								bDoHTTPSForm: true
							});
						}
					}
                }
            }

			// Link tag looks like: <link>urlhere</link>
            var links = lineText.text.match(/<link>.*<\/link>/gi);
            if (links) {
                // Iterate over the links found on this line
                for (let i = 0; i< links.length; i++) {
                    // Get the URL from each individual link
                    var link = links[i].match(/<link>(.*)<\/link>/);
                    let address = link[1];
					if (!DontCheck(address)) {
						// Push it to the array
						linksToReturn.push({
							text: link[0],
							address: address,
							lineText: lineText,
							bDoHTTPSForm: false
						});
						if (gbReportHTTPSAvailable && isPlainHttpLink(address)) {
							// add HTTPS form of it to array also
							linksToReturn.push({
								text: link[0],
								address: address,
								lineText: lineText,
								bDoHTTPSForm: true
							});
						}
					}
                }
            }

			// Url tag looks like: <url>urlhere</url>
            var links = lineText.text.match(/<url>.*<\/url>/gi);
            if (links) {
                // Iterate over the links found on this line
                for (let i = 0; i< links.length; i++) {
                    // Get the URL from each individual link
                    var link = links[i].match(/<url>(.*)<\/url>/);
                    let address = link[1];
					if (!DontCheck(address)) {
						// Push it to the array
						linksToReturn.push({
							text: link[0],
							address: address,
							lineText: lineText,
							bDoHTTPSForm: false
						});
						if (gbReportHTTPSAvailable && isPlainHttpLink(address)) {
							// add HTTPS form of it to array also
							linksToReturn.push({
								text: link[0],
								address: address,
								lineText: lineText,
								bDoHTTPSForm: true
							});
						}
					}
                }
            }

			// Guid tag looks like: <guid>urlhere</guid>
            var links = lineText.text.match(/<guid>.*<\/guid>/gi);
            if (links) {
                // Iterate over the links found on this line
                for (let i = 0; i< links.length; i++) {
                    // Get the URL from each individual link
                    var link = links[i].match(/<guid>(.*)<\/guid>/);
                    let address = link[1];
					if (!DontCheck(address)) {
						// Push it to the array
						linksToReturn.push({
							text: link[0],
							address: address,
							lineText: lineText,
							bDoHTTPSForm: false
						});
						if (gbReportHTTPSAvailable && isPlainHttpLink(address)) {
							// add HTTPS form of it to array also
							linksToReturn.push({
								text: link[0],
								address: address,
								lineText: lineText,
								bDoHTTPSForm: true
							});
						}
					}
                }
            }
			
		}
	    //gOutputChannel.appendLine(`getXmlRssLinks promise returning, linksToReturn.length ${linksToReturn.length}`);
        if (linksToReturn.length > 0) {
            //Return the populated array, which completes the promise.
            resolve(linksToReturn);
        } else {
            //Reject, because we found no links
            reject;
        }
    }).catch();
}


//------------------------------------------------------------------------------

// For Markdown document, convert heading text to implicit ID.
// Change it to lowercase, remove everything not letter digit hyphen space,
// then change spaces to hyphens.

function markdownHeadingToID(sHeading: string): string {
    //gOutputChannel.appendLine(`markdownHeadingToID called, sHeading '${sHeading}'`);
	const regex1 = /[^a-z0-9\- ]/g;
	const regex2 = / /g;
	var sID = sHeading.toLowerCase().replace(regex1, "").replace(regex2, "-");
    //gOutputChannel.appendLine(`markdownHeadingToID return, sID '${sID}'`);
	return sID;
}


//------------------------------------------------------------------------------

// Parse the links out of a Markdown document.

function getMarkdownLinks(document: TextDocument): Promise<Link[]> {
    //gOutputChannel.appendLine(`getMarkdownLinks called, document.uri '${document.uri}'`);
    // Return a promise, since this might take a while for large documents
    return new Promise<Link[]>((resolve, reject) => {
        // Create arrays to hold links as we parse them out
        let linksToReturn = new Array<Link>();
        // Get lines in the document
        let lineCount = document.lineCount;
		//gOutputChannel.appendLine(`getMarkdownLinks lineCount '${lineCount}'`);
        
        //Loop over the lines in a document
        for (let lineNumber = 0; lineNumber < lineCount; lineNumber++) {
            // Get the text for the current line
            let lineText = document.lineAt(lineNumber);
		    //gOutputChannel.appendLine(`getMarkdownLinks lineText.text '${lineText.text}'`);

			// Explicit-ID heading definition looks like: # headingtext {#idhere}
            var links = lineText.text.match(/^\#.+\{\#.+\}/gi);
            if (links) {
			    //gOutputChannel.appendLine(`getMarkdownLinks found an explicit-ID heading definition`);
                // Iterate over the links found on this line
                for (let i = 0; i< links.length; i++) {
                    // Get the URL from each individual link
                    var link = links[i].match(/^\#.+\{\#([^\}]*)\}/);
                    let address = link[1];
				    //gOutputChannel.appendLine(`getMarkdownLinks heading address '${address}'`);
					if (gLocalAnchorNames.indexOf(address) >= 0) {
						// duplicate definition
						addDiagnostic(
									lineNumber,
									lineText.text.indexOf(address),
									address.length,
									DiagnosticSeverity.Error,
									`Duplicate definition of ID '${address}'.`
									);
					} else {
						// new definition
                    	// Push it to the array
                    	gLocalAnchorNames.push(address);
					}
                }
            }

			// Implicit-ID heading definition looks like: # headingtext
			// Heading text is turned into an ID, with spaces replaced with dashes.
            var links = lineText.text.match(/^\#[^\{]+$/gi);
            if (links) {
			    //gOutputChannel.appendLine(`getMarkdownLinks found an implicit-ID heading definition`);
                // Iterate over the links found on this line
                for (let i = 0; i< links.length; i++) {
                    // Get the URL from each individual link
                    var link = links[i].match(/^[\#]+\s*(.*)$/);
                    let address = link[1];
					let sID = markdownHeadingToID(address);
				    //gOutputChannel.appendLine(`getMarkdownLinks heading ID '${sID}'`);
					if (gLocalAnchorNames.indexOf(sID) >= 0) {
						// duplicate definition
						addDiagnostic(
									lineNumber,
									lineText.text.indexOf(address),
									address.length,
									DiagnosticSeverity.Warning,		// warning because maybe user is not expecting implicit
									`Duplicate definition of ID '${sID}'.`
									);
					} else {
						// new definition
                    	// Push it to the array
                    	gLocalAnchorNames.push(sID);
					}
                }
            }

            // Are there links?

			// Link or image looks like:  [identifier](urlhere) or [identifier](urlhere "texthere")
		    //gOutputChannel.appendLine(`getMarkdownLinks match1`);
            var links = lineText.text.match(/\[[^\]]+\]\([^ \)]+[ \)]/gi);
            if (links) {
                // Iterate over the links found on this line
                for (let i = 0; i< links.length; i++) {
                    // Get the URL from each individual link
				    //gOutputChannel.appendLine(`getMarkdownLinks match2`);
                    var link = links[i].match(/\[[^\]]+\]\(([^ \)]+)/);
                    let address = link[1];
				    //gOutputChannel.appendLine(`getMarkdownLinks address1 '${address}'`);
					if (!DontCheck(address)) {
						// Push it to the array
						linksToReturn.push({
							text: link[0],
							address: address,
							lineText: lineText,
							bDoHTTPSForm: false
						});
						if (gbReportHTTPSAvailable && isPlainHttpLink(address)) {
							// add HTTPS form of it to array also
							linksToReturn.push({
								text: link[0],
								address: address,
								lineText: lineText,
								bDoHTTPSForm: true
							});
						}
					}
                }
            }

			// Reference-style link looks like:  [identifier]: <urlhere>
			// where space is mandatory but <> are optional.
			// Do with-<> case first.
		    //gOutputChannel.appendLine(`getMarkdownLinks match3`);
            var links = lineText.text.match(/\[[^\]]+\]:\s+<[^>]+>/gi);
            if (links) {
                // Iterate over the links found on this line
                for (let i = 0; i< links.length; i++) {
                    // Get the URL from each individual link
				    //gOutputChannel.appendLine(`getMarkdownLinks match4`);
                    var link = links[i].match(/\[[^\]]+\]:\s+<([^>]+)>/);
                    let address = link[1];
				    //gOutputChannel.appendLine(`getMarkdownLinks address2 '${address}'`);
					if (!DontCheck(address)) {
						// Push it to the array
						linksToReturn.push({
							text: link[0],
							address: address,
							lineText: lineText,
							bDoHTTPSForm: false
						});
						if (gbReportHTTPSAvailable && isPlainHttpLink(address)) {
							// add HTTPS form of it to array also
							linksToReturn.push({
								text: link[0],
								address: address,
								lineText: lineText,
								bDoHTTPSForm: true
							});
						}
					}
                }
            }

			// Reference-style link looks like:  [identifier]: <urlhere>
			// where space is mandatory but <> are optional.
			// Do without-<> case.
		    //gOutputChannel.appendLine(`getMarkdownLinks match5`);
            var links = lineText.text.match(/\[[^\]]+\]:\s+[^<>\s]+/gi);
            if (links) {
                // Iterate over the links found on this line
                for (let i = 0; i< links.length; i++) {
                    // Get the URL from each individual link
				    //gOutputChannel.appendLine(`getMarkdownLinks match6`);
                    var link = links[i].match(/\[[^\]]+\]:\s+([^\s]+)/);
                    let address = link[1];
				    //gOutputChannel.appendLine(`getMarkdownLinks address2 '${address}'`);
					if (!DontCheck(address)) {
						// Push it to the array
						linksToReturn.push({
							text: link[0],
							address: address,
							lineText: lineText,
							bDoHTTPSForm: false
						});
						if (gbReportHTTPSAvailable && isPlainHttpLink(address)) {
							// add HTTPS form of it to array also
							linksToReturn.push({
								text: link[0],
								address: address,
								lineText: lineText,
								bDoHTTPSForm: true
							});
						}
					}
                }
            }
		}

	    //gOutputChannel.appendLine(`getMarkdownLinks promise returning, linksToReturn.length ${linksToReturn.length}`);
        if (linksToReturn.length > 0) {
            //Return the populated array, which completes the promise.
            resolve(linksToReturn);
        } else {
            //Reject, because we found no links
            reject;
        }
    }).catch();
}


//------------------------------------------------------------------------------

// Scan document for possible bad chars.

function checkBadChars(document: TextDocument): Promise<string> {

    //gOutputChannel.appendLine(`checkBadChars called, document.uri '${document.uri}'`);

    // Return a promise, since this might take a while for large documents
    return new Promise<string>((resolve, reject) => {
        
        // Get lines in the document
        let lineCount = document.lineCount;
        
        // Loop over the lines in a document
        for (let lineNumber = 0; lineNumber < lineCount; lineNumber++) {
            // Get the text for the current line
            let lineText = document.lineAt(lineNumber);

			var aMatches = lineText.text.match(RegExp(gsPatternBadChars,"g"));
			if (aMatches) {
				// Iterate over the matches found on this line
				for (let i = 0; i< aMatches.length; i++) {
					//gOutputChannel.appendLine(`checkBadChars: poss bad char on line ${lineNumber} is '${aMatches[i]}'`);
					addDiagnostic(
						lineNumber,
						lineText.text.indexOf(aMatches[i]),
						aMatches[i].length,
						gBadCharsSeverity,
						`Possible bad character '${aMatches[i]}'`
						);
				}
			}
        
		}
	    //gOutputChannel.appendLine(`checkBadChars promise returning`);
        resolve("done");
    }).catch();
}


//------------------------------------------------------------------------------

// Scan document for possible mistakes.

function checkPossibleMistakes(document: TextDocument): Promise<string> {

    //gOutputChannel.appendLine(`checkPossibleMistakes called, document.uri '${document.uri}'`);

    // Return a promise, since this might take a while for large documents
    return new Promise<string>((resolve, reject) => {
        
        // Get lines in the document
        let lineCount = document.lineCount;
        
        // Loop over the lines in a document
        for (let lineNumber = 0; lineNumber < lineCount; lineNumber++) {
            // Get the text for the current line
            let lineText = document.lineAt(lineNumber);
        
			// Loop over the defined possible mistakes
			for (let nPossMist = 0; nPossMist < gaPatternPossibleMistakes.length; nPossMist++) {
				var sPossMist = gaPatternPossibleMistakes[nPossMist];
				//sPossMist = "<h1></h1>"
				////gOutputChannel.appendLine(`checkPossibleMistakes: sPossMist '${sPossMist}'`);

				var aMatches = lineText.text.match(RegExp(sPossMist, "gi"));
				if (aMatches) {
					// Iterate over the matches found on this line
					for (let i = 0; i< aMatches.length; i++) {
						//gOutputChannel.appendLine(`checkPossibleMistakes: sPossMist '${sPossMist}' match ${i} on line ${lineNumber} is '${aMatches[i]}'`);
						addDiagnostic(
							lineNumber,
							lineText.text.indexOf(aMatches[i]),
							aMatches[i].length,
							gPossibleMistakesSeverity,
							`Possible mistake in '${aMatches[i]}'`
							);
					}
				}

			}

		}
	    //gOutputChannel.appendLine(`checkPossibleMistakes promise returning`);
        resolve("done");
    }).catch();
}


//------------------------------------------------------------------------------

// Scan document for semantic HTML.
//
// Doesn't try to catch errors such as mismatched or missing end tags.
// The editor will catch those.

function scanSemanticHTML(document: TextDocument): Promise<string> {

    //gOutputChannel.appendLine(`scanSemanticHTML called, document.uri '${document.uri}'`);

	var bInBody = false;
	var bFoundHeader = false;
	var bFoundMain = false;
	var bFoundFooter = false;
	var bInMain = false;
	var bInSection = false;		// includes section, article, aside
	var bFoundHeadingInSection = false;
	var nCurrentHeadingLevel = 0;
	var nLinesInMain = 0;
	var nLinesInMainAndInSection = 0;
	var nLineNumberOfMain = 0;
	var arrnPrevHeadingLevel = new Array();

    // Return a promise, since this might take a while for large documents
    return new Promise<string>((resolve, reject) => {
        
        // Get lines in the document
        let lineCount = document.lineCount;
        
        // Loop over the lines in a document
        for (let lineNumber = 0; lineNumber < lineCount; lineNumber++) {
            // Get the text for the current line
            let lineText = document.lineAt(lineNumber);

			if (bInMain) {
				nLinesInMain++;
				if (bInSection)
					nLinesInMainAndInSection++;
			}

			// order of checks matters if there are multiple tags on one line
        
			var aMatches = lineText.text.match(RegExp("<header", "i"));
			if (aMatches) {
				//gOutputChannel.appendLine(`scanSemanticHTML: match start-header`);
				bFoundHeader = true;
			}
        
			var aMatches = lineText.text.match(RegExp("<main", "i"));
			if (aMatches) {
				//gOutputChannel.appendLine(`scanSemanticHTML: match start-main`);
				bFoundMain = true;
				bInMain = true;
			}
        
			var aMatches = lineText.text.match(RegExp("<section|<article|<aside", "i"));
			if (aMatches) {
				//gOutputChannel.appendLine(`scanSemanticHTML: match start-section`);
				bInSection = true;

				if (!bInMain) {
					addDiagnostic(
						lineNumber,
						lineText.text.indexOf(aMatches[0]),
						aMatches[0].length,
						gSemanticSeverity,
						`Semantic HTML: Start of section/article/aside but not inside main: '${aMatches[0]}'`
						);
				}

				bFoundHeadingInSection = false;
			}
        
			var aMatches = lineText.text.match(RegExp("<h1|<h2|<h3|<h4|<h5|<h6|<h7|<h8|<h9", "i"));
			if (aMatches) {
				//gOutputChannel.appendLine(`scanSemanticHTML: match start-heading; aMatches[0][2] '${aMatches[0][2]}'`);

				if (!bInSection) {
					addDiagnostic(
						lineNumber,
						lineText.text.indexOf(aMatches[0]),
						aMatches[0].length,
						gSemanticSeverity,
						`Semantic HTML: Heading '${aMatches[0]}' not inside section/article/aside`
						);
					// maybe this page is not using Semantic HTML at all ?
					if (!bInMain) {
						addDiagnostic(
							lineNumber,
							lineText.text.indexOf(aMatches[0]),
							aMatches[0].length,
							gSemanticSeverity,
							`Semantic HTML: Heading '${aMatches[0]}' not inside main either; stopping checks of semantic HTML`
							);
						break;	// end the loop
					}
				} else {
					if (bFoundHeadingInSection) {
						addDiagnostic(
							lineNumber,
							lineText.text.indexOf(aMatches[0]),
							aMatches[0].length,
							gSemanticSeverity,
							`Semantic HTML: More than one heading inside section/article/aside`
							);
					}
					bFoundHeadingInSection = true;
				}

				var c = Number(aMatches[0][2]);
				var z = Number('0');
				var nNewHeadingLevel = c - z;
				//gOutputChannel.appendLine(`scanSemanticHTML: nNewHeadingLevel ${nNewHeadingLevel}, nCurrentHeadingLevel ${nCurrentHeadingLevel}`);

				if (nNewHeadingLevel <= nCurrentHeadingLevel) {
					addDiagnostic(
						lineNumber,
						lineText.text.indexOf(aMatches[0]),
						aMatches[0].length,
						gSemanticSeverity,
						`Semantic HTML: Existing section contains new section with same or lower heading level '${aMatches[0]}'`
						);
				} else {
					arrnPrevHeadingLevel.push(nCurrentHeadingLevel);
					nCurrentHeadingLevel = nNewHeadingLevel;
				}
			}
        
			var aMatches = lineText.text.match(RegExp("</h1|</h2|</h3|</h4|</h5|</h6|</h7|</h8|</h9", "i"));
			if (aMatches) {
				//gOutputChannel.appendLine(`scanSemanticHTML: match start-heading`);
			}
        
			var aMatches = lineText.text.match(RegExp("</section|</article|</aside", "i"));
			if (aMatches) {
				//gOutputChannel.appendLine(`scanSemanticHTML: match end-section`);

				if (!bFoundHeadingInSection) {
					addDiagnostic(
						lineNumber,
						lineText.text.indexOf(aMatches[0]),
						aMatches[0].length,
						gSemanticSeverity,
						`Semantic HTML: No heading in section/article/aside '${aMatches[0]}'`
						);
				} else {
					nNewHeadingLevel = arrnPrevHeadingLevel.pop();
					//gOutputChannel.appendLine(`scanSemanticHTML: nNewHeadingLevel ${nNewHeadingLevel}, nCurrentHeadingLevel ${nCurrentHeadingLevel}`);
					nCurrentHeadingLevel = nNewHeadingLevel;
					if (nCurrentHeadingLevel == 0)
						bInSection = false;
				}
			}
        
			var aMatches = lineText.text.match(RegExp("</main", "i"));
			if (aMatches) {
				//gOutputChannel.appendLine(`scanSemanticHTML: match end-main`);
				bInMain = false;
			}
        
			var aMatches = lineText.text.match(RegExp("<footer", "i"));
			if (aMatches) {
				//gOutputChannel.appendLine(`scanSemanticHTML: match start-footer`);
				bFoundFooter = true;
			}

		}

		if (!bFoundHeader) {
			addDiagnostic(
				0,
				0,
				5,
				gSemanticSeverity,
				`Semantic HTML: No 'header' in document`
				);
		}

		if (!bFoundMain) {
			addDiagnostic(
				0,
				0,
				5,
				gSemanticSeverity,
				`Semantic HTML: No 'main' in document`
				);
		}

		if (!bFoundFooter) {
			addDiagnostic(
				0,
				0,
				5,
				gSemanticSeverity,
				`Semantic HTML: No 'footer' in document`
				);
		}

		if (nLinesInMain > 0) {
			addDiagnostic(
				nLineNumberOfMain,
				0,
				5,
				DiagnosticSeverity.Information,
				`Semantic HTML: ${nLinesInMainAndInSection} lines in sections out of ${nLinesInMain} total lines in main: ${Math.round((nLinesInMainAndInSection*100)/nLinesInMain)}%`
				);
		}

	    //gOutputChannel.appendLine(`scanSemanticHTML promise returning`);
        resolve("done");
    }).catch();
}


//------------------------------------------------------------------------------

// Is this an HTTP or HTTPS link?

function isHttpLink(UriToCheck: string): boolean {
	var bRetVal = UriToCheck.toLowerCase().startsWith('http://');
	if (!bRetVal)
		bRetVal = UriToCheck.toLowerCase().startsWith('https://');
	if (!bRetVal)
		bRetVal = UriToCheck.toLowerCase().startsWith('shttp://');
    return bRetVal;
}


// Is this an HTTP link?

function isPlainHttpLink(UriToCheck: string): boolean {
	var bRetVal = UriToCheck.toLowerCase().startsWith('http://');
    return bRetVal;
}


// Is this an onion link?

function isOnionLink(UriToCheck: string): boolean {
	var bRetVal = UriToCheck.toLowerCase().startsWith('https://');
	if (bRetVal)
		bRetVal = UriToCheck.toLowerCase().includes('.onion');
    return bRetVal;
}


// Get domain name from an onion link

function getDomainFromOnionLink(UriToCheck: string): string {
	var domains = UriToCheck.match(/https:\/\/(.*\.onion)/);
	let domain = domains[1];
    return domain;
}


// Is this a non-HTTP* link?

function isNonHTTPLink(UriToCheck: string): boolean {
	var bRetVal = UriToCheck.toLowerCase().startsWith('ftp://');
	if (!bRetVal)
		bRetVal = UriToCheck.toLowerCase().startsWith('file://');
	if (!bRetVal)
		bRetVal = UriToCheck.toLowerCase().startsWith('irc://');
	if (!bRetVal)
		bRetVal = UriToCheck.toLowerCase().startsWith('ldap://');
	if (!bRetVal)
		bRetVal = UriToCheck.toLowerCase().startsWith('telnet://');
	if (!bRetVal)
		bRetVal = UriToCheck.toLowerCase().startsWith('sftp://');
	if (!bRetVal)
		bRetVal = UriToCheck.toLowerCase().startsWith('news://');
	if (!bRetVal)
		bRetVal = UriToCheck.toLowerCase().startsWith('news:');
	if (!bRetVal)
		bRetVal = UriToCheck.toLowerCase().startsWith('mailto:');
    return bRetVal;
}


// Is this a mailto link?

function isMailtoLink(UriToCheck: string): boolean {
	var bRetVal = UriToCheck.toLowerCase().startsWith('mailto:');
    return bRetVal;
}


// Is this a validly-formatted mailto link?
// Can be:
//		mailto:bill@corp.com
//		mailto:bill@corp.com?lotsmorestuff (we won't check the lotsmorestuff)
// https://en.wikipedia.org/wiki/Email_address#Syntax
// Doesn't check for lots of details such as "hyphen can't be first or last char of domain name"

function isWellFormedMailtoLink(UriToCheck: string): boolean {
	//gOutputChannel.appendLine(`isWellFormedMailtoLink: called, UriToCheck '${UriToCheck}'`);
	var regex1 = /mailto:[a-z0-9\!\#\$\%\&\'\*\+\-\/\=\^\_\`\{\|\}\~\.\+\_]+@[a-z0-9\-]+\.[a-z0-9\-\.]+$/i;
	var bRetVal = regex1.test(UriToCheck);
	//gOutputChannel.appendLine(`isWellFormedMailtoLink: first, bRetVal '${bRetVal}'`);
	if (!bRetVal) {
		var regex2 = /mailto:[a-z0-9\!\#\$\%\&\'\*\+\-\/\=\^\_\`\{\|\}\~\.\+\_]+@[a-z0-9\-]+\.[a-z0-9\-\.]+\?[a-z]/i;
		bRetVal = regex2.test(UriToCheck);
		//gOutputChannel.appendLine(`isWellFormedMailtoLink: second, bRetVal '${bRetVal}'`);
	}
    return bRetVal;
}


function DontCheck(address:string): boolean {
	var bRetVal = false;
	for (let i = 0; i < gaDontCheck.length; i++) {
		if (address.indexOf("://" + gaDontCheck[i]) != (-1)) {
			bRetVal = true;
			break;
		}
	}
	//gOutputChannel.appendLine(`DontCheck: address '${address}', bRetVal ${bRetVal}`);
	return bRetVal;
}


//------------------------------------------------------------------------------

function addDiagnostic(
					lineNumber:number,
					start:number,
					length:number,
					severity:DiagnosticSeverity,
					msg:String
					): void {
	var diag = new Diagnostic(
						new Range(new Position(lineNumber,start),new Position(lineNumber,start+length)),
						`${msg}`,
						severity);
	gDiagnosticsArray.push(diag);
	gDiagnosticsCollection.set(gDocument.uri,gDiagnosticsArray);
}


//------------------------------------------------------------------------------
