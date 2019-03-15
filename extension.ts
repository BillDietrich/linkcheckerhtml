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
// For checking internet URIs
import {
	AxiosPromise,
	AxiosResponse,
	CancelToken
	} from 'axios';
const axios = require('axios');

//Interface for links
interface Link {
    text: string
    address: string
    lineText: TextLine
	bDoHTTPSForm: boolean	// address is HTTP, but check HTTPS form of it
}

var myStatusBarItem: StatusBarItem = null;
var gDiagnosticsCollection: DiagnosticCollection = null;
var gDiagnosticsArray: Array<Diagnostic> = null;
var gConfiguration: WorkspaceConfiguration = null;
var gDocument = null;
var gStartingNLinks = 0;
var gnTimeout = 12;	// seconds
var gbCheckInternalLinks = true;
var gbProcessIdAttributeInAnyTag = true;
var gbDone = true;
var gbCancelled = false;
var gLocalAnchorNames: Array<String> = null;

//var gOutputChannel = null;	// remove comment chars to do debugging


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
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

    //gOutputChannel.appendLine(`activate: finished`);
}

// this method is called when your extension is deactivated
export function deactivate() {
	// delete any OS resources you allocated that are not
	// included in extensionContext.subscriptions
}


// open current selected URL in browser
export function openURL() {
    //gOutputChannel.appendLine(`openURL: called`);
	let editor = window.activeTextEditor;
	if (!editor) return;
	let selection = editor.selection;
	if (!selection) return;
	let sURL = editor.document.getText(selection);

	// want to move cursor from diagnostics pane to editor pane
	// but can't figure out how to do it
	//window.showTextDocument(editor);
	//workbench.action.navigateToLastEditLocation

    //gOutputChannel.appendLine(`openURL: call open, sURL '${sURL}'`);
	commands.executeCommand('vscode.open', Uri.parse(sURL));	// ignores local files
    //gOutputChannel.appendLine(`openURL: returning`);
}


// open current selected HTTP URL as HTTPS URL in browser
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

		//gOutputChannel.appendLine(`openURLasHTTPS: call open, sURLasHTTPS ${sURLasHTTPS}`);
		commands.executeCommand('vscode.open', Uri.parse(sURLasHTTPS));	// ignores local files
		//gOutputChannel.appendLine(`openURLasHTTPS: returning`);
	}
}


// Generate a report of broken links and the line they occur on
function generateLinkReport() {

    //gOutputChannel.appendLine(`generateLinkReport: called`);

    // Get the current document
    gDocument = window.activeTextEditor.document;

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

	// should free old array ?
	gDiagnosticsArray = new Array<Diagnostic>();
	gDiagnosticsCollection.set(gDocument.uri,gDiagnosticsArray);

/*
	var diag = new Diagnostic(new Range(new Position(1,10),new Position(2,20)), "message", DiagnosticSeverity.Error);
	gDiagnosticsArray.push(diag);
	gDiagnosticsCollection.set(gDocument.uri,gDiagnosticsArray);
*/

	gConfiguration = workspace.getConfiguration('linkcheckerhtml');
	var nMaxParallelThreads = gConfiguration.maxParallelThreads;
	if (nMaxParallelThreads < 1)
		nMaxParallelThreads = 1;
	if (nMaxParallelThreads > 20)
		nMaxParallelThreads = 20;
	gnTimeout = gConfiguration.timeout;
	if (gnTimeout < 5)
		gnTimeout = 5;
	if (gnTimeout > 30)
		gnTimeout = 30;
	gbCheckInternalLinks = gConfiguration.checkInternalLinks;
	gbProcessIdAttributeInAnyTag = gConfiguration.processIdAttributeInAnyTag;

	gLocalAnchorNames = new Array<String>();

    // Get all links in the document
    let p1 = getLinks(gDocument);
	p1.then((links) => {
		// callback function for the "success" branch of the p1 Promise
		// Promise resolved now, so we're in a different context than before
	    //gOutputChannel.appendLine(`generateLinkReport.p1.then: got ${links.length} links`);

		gStartingNLinks = links.length;
		myStatusBarItem.text = `Checking ${gStartingNLinks} links ...`;
		myStatusBarItem.show();

		let p2 = throttleActions(links, nMaxParallelThreads);
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



/**
 * Performs a list of callable actions (promise factories) so that only a limited
 * number of promises are pending at any given time.
 *
  * @returns A Promise that resolves to the full list of values when everything is done.
 */
function throttleActions(links, limit): Promise<any> {
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

		myStatusBarItem.text = `Checking ${gStartingNLinks} links, ${links.length-i} more to do ...`;
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



function doALink(link): Promise<null> {

	//gOutputChannel.appendLine(`doALink: called, link.address '${link.address}'`);

	var diag = null;
/*
	diag = new Diagnostic(new Range(new Position(1,10),new Position(2,20)), "messageHHHH", DiagnosticSeverity.Error);
	gDiagnosticsArray.push(diag);
	gDiagnosticsCollection.set(gDocument.uri,gDiagnosticsArray);
*/

	//gOutputChannel.appendLine(`doALink: link on line ${link.lineText.lineNumber + 1} is ${link.address}'`);
	var lineNumber = link.lineText.lineNumber;

	let myPromise = null;
	
	// Is it an HTTP* link or a relative link?
	if (isHttpLink(link.address)) {
		// And check if they are broken or not.
		let sReportRedirects = gConfiguration.reportRedirects;
		let sUserAgent = gConfiguration.userAgent;
		let sReportHTTPSAvailable = gConfiguration.reportHTTPSAvailable;
		//gOutputChannel.appendLine(`doALink: sReportRedirects ${sReportRedirects}, sUserAgent '${sUserAgent}', sReportHTTPSAvailable '${sReportHTTPSAvailable}'`);
		var address = link.address;
		if (link.bDoHTTPSForm)
			address = link.address.slice(0, 4) + "s" + link.address.slice(4);
		//gOutputChannel.appendLine(`doALink: address '${address}'`);
		myPromise = axios.get(address,
								{
								validateStatus: null,
								timeout: (gnTimeout * 1000),
								maxRedirects: ((sReportRedirects[0]!='D') ? 0 : 4),
								headers: {'User-Agent': `${sUserAgent}`}
								});
		myPromise.then(
			(response) =>
		{
			// callback function for the "result" branch of the axios Promise
			//gOutputChannel.appendLine(`doALink.axiosPromise.then: got response for ${response.request}: ${response.status} (${response.statusText})`);
			let sReportRedirects = gConfiguration.reportRedirects;
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
								`'${link.address}' is unreachable: ${response.status} (${response.statusText})`
								);
				}
				// else HTTPS form of HTTP link, and it's not found, don't report
			} else if ((sReportRedirects[0]!='D') && ((response.status > 300) && (response.status < 400))) {
				//gOutputChannel.appendLine(`doALink.axiosPromise.then: ${link.address} on line ${lineNumber} redirected.`);
				if (!link.bDoHTTPSForm) {
					// HTTP form of link, and it redirected
					var severity:DiagnosticSeverity = DiagnosticSeverity.Information;
					switch (sReportRedirects[3]) {
						case 'E': severity = DiagnosticSeverity.Error; break;
						case 'W': severity = DiagnosticSeverity.Warning; break;
						case 'I': severity = DiagnosticSeverity.Information; break;
					}
					addDiagnostic(
								lineNumber,
								link.lineText.text.indexOf(link.address),
								link.address.length,
								severity,
								`'${link.address}' redirects; ${response.status} (${response.statusText})`
								);
				} else {
					// else HTTPS form of HTTP link, and it's found and redirected
					var severity:DiagnosticSeverity = DiagnosticSeverity.Information;
					switch (sReportHTTPSAvailable[3]) {
						case 'E': severity = DiagnosticSeverity.Error; break;
						case 'W': severity = DiagnosticSeverity.Warning; break;
						case 'I': severity = DiagnosticSeverity.Information; break;
					}
					addDiagnostic(
								lineNumber,
								link.lineText.text.indexOf(link.address),
								link.address.length,
								severity,
								`HTTPS form of '${link.address}' is available; ${response.status} (${response.statusText})`
								);
				}
			} else {
				//gOutputChannel.appendLine(`doALink.axiosPromise.then: ${link.address} on line ${lineNumber} is accessible.`);
				if (link.bDoHTTPSForm) {
					// HTTPS form of link, and it is accessible
					var severity:DiagnosticSeverity = DiagnosticSeverity.Information;
					switch (sReportHTTPSAvailable[3]) {
						case 'E': severity = DiagnosticSeverity.Error; break;
						case 'W': severity = DiagnosticSeverity.Warning; break;
						case 'I': severity = DiagnosticSeverity.Information; break;
					}
					addDiagnostic(
								lineNumber,
								link.lineText.text.indexOf(link.address),
								link.address.length,
								severity,
								`HTTPS form of '${link.address}' is available; ${response.status} (${response.statusText})`
								);
				}
			}
		},
			(error) =>
		{
			//gOutputChannel.appendLine(`doALink.axiosPromise.catch0: ${link.address} error: ${error} typeof error: ${typeof error}`);
			addDiagnostic(
						lineNumber,
						link.lineText.text.indexOf(link.address),
						link.address.length,
						DiagnosticSeverity.Error,
						`'${link.address}' is unreachable: ${error}`
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
						`'${link.address}' is unreachable: ${error}`
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
			let bCheckMailtoDestFormat = gConfiguration.checkMailtoDestFormat;
			if (bCheckMailtoDestFormat && isMailtoLink(link.address)) {
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
				let sReportNonHandledSchemes = gConfiguration.reportNonHandledSchemes;
				// as Error, as Warning, as Information, Don't report
				if (sReportNonHandledSchemes[0] != 'D') {
					//gOutputChannel.appendLine(`doALink: ${link.address} on line ${lineNumber} is non-HTTP* link; not checked.`);
					var severity:DiagnosticSeverity = DiagnosticSeverity.Information;
					switch (sReportNonHandledSchemes[3]) {
						case 'E': severity = DiagnosticSeverity.Error; break;
						case 'W': severity = DiagnosticSeverity.Warning; break;
						case 'I': severity = DiagnosticSeverity.Information; break;
					}
					addDiagnostic(
								lineNumber,
								link.lineText.text.indexOf(link.address),
								link.address.length,
								severity,
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
					let sLocalRoot = gConfiguration.localRoot;
					sAddress = sLocalRoot + sAddress;
				}
				// Find the directory from the path to the current document
				var currentWorkingDirectory = path.dirname(gDocument.fileName);
				// Use that to resolve the full path from the relative link address
				// The `.split('#')[0]` at the end is so that relative links that also reference an anchor in the document will work with file checking.
				var fullPath = path.resolve(currentWorkingDirectory, sAddress).split('#')[0];
				//gOutputChannel.appendLine(`doALink: link.address '${link.address}' and sAddress '${sAddress}' and currentWorkingDirectory '${currentWorkingDirectory}' gives fullPath '${fullPath}'`);
				// Check if the file exists and log appropriately
				if (fs.existsSync(fullPath)) {
					//gOutputChannel.appendLine(`doALink: local file ${sAddress} on line ${lineNumber} exists.`);
				} else {
					//gOutputChannel.appendLine(`doALink: local file ${sAddress} on line ${lineNumber} does not exist.`);
					addDiagnostic(
								lineNumber,
								link.lineText.text.indexOf(link.address),
								link.address.length,
								DiagnosticSeverity.Error,
								`Local file '${sAddress}'  does not exist.`
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



// Parse the HTML Anchor links out of the document
function getLinks(document: TextDocument): Promise<Link[]> {
    //gOutputChannel.appendLine(`getLinks called, document.uri '${document.uri}'`);
    // Return a promise, since this might take a while for large documents
    return new Promise<Link[]>((resolve, reject) => {
        // Create arrays to hold links as we parse them out
        let linksToReturn = new Array<Link>();
        // Get lines in the document
        let lineCount = document.lineCount;

		let sReportHTTPSAvailable = gConfiguration.reportHTTPSAvailable;
	    //gOutputChannel.appendLine(`getLinks: sReportHTTPSAvailable '${sReportHTTPSAvailable}'`);
		// as Error, as Warning, as Information, Don't check and report
		var bReportHTTPSAvailable = false;
		switch (sReportHTTPSAvailable[3]) {
			case 'E':
			case 'W':
			case 'I':
					bReportHTTPSAvailable = true;
					break;
		}
	    //gOutputChannel.appendLine(`getLinks: bReportHTTPSAvailable ${bReportHTTPSAvailable}`);
        
        //Loop over the lines in a document
        for (let lineNumber = 0; lineNumber < lineCount; lineNumber++) {
            // Get the text for the current line
            let lineText = document.lineAt(lineNumber);

            // Are there links?

			// Anchor-href link looks like: <a ... href="urlhere" ... >
            var links = lineText.text.match(/<a[^>]*\shref="[^"]*"/g);
            if (links) {
                // Iterate over the links found on this line
                for (let i = 0; i< links.length; i++) {
                    // Get the URL from each individual link
                    var link = links[i].match(/<a[^>]*\shref="([^"]*)"/);
                    let address = link[1];
                    // Push it to the array
                    linksToReturn.push({
                        text: link[0],
                        address: address,
                        lineText: lineText,
						bDoHTTPSForm: false
                    });
					if (bReportHTTPSAvailable && isPlainHttpLink(address)) {
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

			// Anchor-name definition looks like: <a ... name="urlhere" ... >
            var links = lineText.text.match(/<a[^>]*\sname="[^"]*"/g);
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
				var links = lineText.text.match(/<[^>]*\sid="[^"]*"/g);
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
				var links = lineText.text.match(/<a[^>]*\sid="[^"]*"/g);
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
            links = lineText.text.match(/<img[^>]*\ssrc="[^"]*"/g);
            if (links) {
                // Iterate over the links found on this line
                for (let i = 0; i< links.length; i++) {
                    // Get the URL from each individual link
                    var link = links[i].match(/<img[^>]*\ssrc="([^"]*)"/);
                    let address = link[1];
                    // Push it to the array
                    linksToReturn.push({
                        text: link[0],
                        address: address,
                        lineText: lineText,
						bDoHTTPSForm: false
                    });
					if (bReportHTTPSAvailable && isPlainHttpLink(address)) {
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

			// Script-src link looks like: <script ... src="urlhere" ... >
            links = lineText.text.match(/<script[^>]*\ssrc="[^"]*"/g);
            if (links) {
                // Iterate over the links found on this line
                for (let i = 0; i< links.length; i++) {
                    // Get the URL from each individual link
                    var link = links[i].match(/<script[^>]*\ssrc="([^"]*)"/);
                    let address = link[1];
                    // Push it to the array
                    linksToReturn.push({
                        text: link[0],
                        address: address,
                        lineText: lineText,
						bDoHTTPSForm: false
                    });
					if (bReportHTTPSAvailable && isPlainHttpLink(address)) {
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
			
			// Link-href link looks like: <link ... href="urlhere" ... >
            links = lineText.text.match(/<link[^>]*\shref="[^"]*"/g);
            if (links) {
                // Iterate over the links found on this line
                for (let i = 0; i< links.length; i++) {
                    // Get the URL from each individual link
                    var link = links[i].match(/<link[^>]*\shref="([^"]*)"/);
                    let address = link[1];
                    // Push it to the array
                    linksToReturn.push({
                        text: link[0],
                        address: address,
                        lineText: lineText,
						bDoHTTPSForm: false
                    });
					if (bReportHTTPSAvailable && isPlainHttpLink(address)) {
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
	    //gOutputChannel.appendLine(`getLinks promise returning, linksToReturn.length ${linksToReturn.length}`);
        if (linksToReturn.length > 0) {
            //Return the populated array, which completes the promise.
            resolve(linksToReturn);
        } else {
            //Reject, because we found no links
            reject;
        }
    }).catch();
}



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
