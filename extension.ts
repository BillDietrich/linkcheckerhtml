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
}

let myStatusBarItem: StatusBarItem;
let gDiagnosticsCollection: DiagnosticCollection;
let gDiagnosticsArray: Array<Diagnostic>;
let gConfiguration: WorkspaceConfiguration;
//var gOutputChannel = null;
var gDocument = null;
var gStartingNLinks = 0;


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(extensionContext:ExtensionContext) {     
    
	//gOutputChannel = window.createOutputChannel("linkcheckerhtml");
    // Show the output channel
    //gOutputChannel.show(false);	// preserveFocus == false
    ////gOutputChannel.appendLine(`activate: active`);
	////gOutputChannel.appendLine(`activate: uri = ${window.activeTextEditor.document.uri.toString()}`);
    ////gOutputChannel.appendLine(`activate: visibleTextEditors.length = ${window.visibleTextEditors.length}`);

    commands.registerCommand('extension.generateLinkReport', generateLinkReport);

	myStatusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, 0);
	extensionContext.subscriptions.push(myStatusBarItem);
	myStatusBarItem.hide();

	gDiagnosticsCollection = languages.createDiagnosticCollection("linkcheckerhtml");

    //gOutputChannel.appendLine(`activate: finished`);
}

// this method is called when your extension is deactivated
export function deactivate() {
	// delete any OS resources you allocated that are not
	// included in extensionContext.subscriptions
}

// Generate a report of broken links and the line they occur on
function generateLinkReport() {

    //gOutputChannel.appendLine(`generateLinkReport: called`);

    // Get the current document
    gDocument = window.activeTextEditor.document;

	myStatusBarItem.text = `Checking for broken links ...`;
	myStatusBarItem.show();

	// should free old array ?
	gDiagnosticsArray = new Array<Diagnostic>();
	gDiagnosticsCollection.set(gDocument.uri,gDiagnosticsArray);

/*
	var diag = new Diagnostic(new Range(new Position(1,10),new Position(2,20)), "message", DiagnosticSeverity.Error);
	gDiagnosticsArray.push(diag);
	gDiagnosticsCollection.set(gDocument.uri,gDiagnosticsArray);
*/

	gConfiguration = workspace.getConfiguration('linkcheckerhtml');

    // Get all links in the document
    let p1 = getLinks(gDocument);
	p1.then((links) => {
		// callback function for the "success" branch of the p1 Promise
		// Promise resolved now, so we're in a different context than before
	    //gOutputChannel.appendLine(`generateLinkReport.p1.then: got ${links.length} links`);

		gStartingNLinks = links.length;
		myStatusBarItem.text = `Checking ${gStartingNLinks} links ...`;
		myStatusBarItem.show();

/*
		diag = new Diagnostic(new Range(new Position(1,10),new Position(2,20)), "messageHHHH", DiagnosticSeverity.Error);
		gDiagnosticsArray.push(diag);
		gDiagnosticsCollection.set(gDocument.uri,gDiagnosticsArray);
*/

		let p2 = throttleActions(links, 4);
		p2.then((links) => {
		    //gOutputChannel.appendLine(`generateLinkReport.p2.then: called`);
			myStatusBarItem.text = ``;
			myStatusBarItem.show();
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

		myStatusBarItem.text = `Checking ${gStartingNLinks} links, ${links.length-i} more to do ...`;
		myStatusBarItem.show();
		
		if (i < links.length) {
			// Save the current value of i, so we can put the result in the right place
			let linkIndex = i++;
			//gOutputChannel.appendLine(`doNextAction: returning`);
			return Promise.resolve(doALink(links[linkIndex]))
				.then(result => {
					return;
				}).then(doNextAction);
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

	//gOutputChannel.appendLine(`doALink: called, link.address ${link.address}`);

	var diag = null;
/*
	diag = new Diagnostic(new Range(new Position(1,10),new Position(2,20)), "messageHHHH", DiagnosticSeverity.Error);
	gDiagnosticsArray.push(diag);
	gDiagnosticsCollection.set(gDocument.uri,gDiagnosticsArray);
*/

	////gOutputChannel.appendLine(`doALink: link on line ${link.lineText.lineNumber + 1} is "${link.address}"`);
	var lineNumber = link.lineText.lineNumber;

	let myPromise = null;
	
	// Is it an HTTP* link or a relative link?
	if (isHttpLink(link.address)) {
		// And check if they are broken or not.
		let bReportRedirectAsError = gConfiguration.reportRedirectAsError;
		//gOutputChannel.appendLine(`doALink: bReportRedirectAsError ${bReportRedirectAsError}`);
		//const CancelToken = axios.CancelToken;
		//const source = CancelToken.source();
		myPromise = axios.get(link.address,
								{
								validateStatus: null,
								//timeout: 500,
								//cancelToken: source.token,
								//maxRedirects: ((sReportRedirectAsError[0]!='D') ? 0 : 9)
								maxRedirects: 9
								});
		myPromise.then(
			(response) =>
		{
			// callback function for the "result" branch of the axios Promise
			//gOutputChannel.appendLine(`doALink.axiosPromise.then: got response for ${response.request}: ${response.status} (${response.statusText})`);
			let sReportRedirectAsError = gConfiguration.reportRedirectAsError;
			// as Error, as Warning, as Information, Don't report
			if ((response.status > 400) && (response.status < 600)) {
				//gOutputChannel.appendLine(`doALink.axiosPromise.then: ${link.address} on line ${lineNumber} is unreachable.`);
				let start = link.lineText.text.indexOf(link.address);
				let end = start + link.address.length;
				diag = new Diagnostic(new Range(new Position(lineNumber,start),new Position(lineNumber,end)), `${link.address} is unreachable`+(bReportRedirectAsError?` or redirects; `:`; `)+`${response.status} (${response.statusText})`, DiagnosticSeverity.Error);
				gDiagnosticsArray.push(diag);
				gDiagnosticsCollection.set(gDocument.uri,gDiagnosticsArray);
			} else if ((sReportRedirectAsError[0]!='D') && ((response.status > 300) && (response.status < 400))) {
				//gOutputChannel.appendLine(`doALink.axiosPromise.then: ${link.address} on line ${lineNumber} redirected.`);
				let start = link.lineText.text.indexOf(link.address);
				let end = start + link.address.length;
				var severity:DiagnosticSeverity = DiagnosticSeverity.Information;
				switch (sReportRedirectAsError[3]) {
					case 'E': severity = DiagnosticSeverity.Error; break;
					case 'W': severity = DiagnosticSeverity.Warning; break;
					case 'I': severity = DiagnosticSeverity.Information; break;
				}
				diag = new Diagnostic(new Range(new Position(lineNumber,start),new Position(lineNumber,end)), `${link.address} redirects; ${response.status} (${response.statusText})`, severity);
				gDiagnosticsArray.push(diag);
				gDiagnosticsCollection.set(gDocument.uri,gDiagnosticsArray);
			} else {
				//gOutputChannel.appendLine(`doALink.axiosPromise.then: ${link.address} on line ${lineNumber} is accessible.`);
			}
		},
			(error) =>
		{
			//gOutputChannel.appendLine(`doALink.axiosPromise.catch0: ${link.address} error: ${error} typeof error: ${typeof error}`);
			let start = link.lineText.text.indexOf(link.address);
			let end = start + link.address.length;
			//diag = new Diagnostic(new Range(new Position(lineNumber,start),new Position(lineNumber,end)), `Internal error, sorry: ${link.address} was not checked`, DiagnosticSeverity.Warning);
			diag = new Diagnostic(new Range(new Position(lineNumber,start),new Position(lineNumber,end)), `${link.address} is unreachable and causing the extension to hang: ${error}`, DiagnosticSeverity.Error);
			gDiagnosticsArray.push(diag);
			gDiagnosticsCollection.set(gDocument.uri,gDiagnosticsArray);
			// CAN'T FIGURE OUT WHAT TO DO HERE TO STOP HANG
			myPromise = Promise.resolve();
			//gOutputChannel.appendLine(`doALink.axiosPromise.catch0: end`);
			return myPromise;
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
			// BAD NEWS: WE HANG FOREVER IF TIMEOUT or MAX-REDIRECTS-EXCEEDED AND WE GET HERE
			// axios created a Promise but rejected starting it, somehow.
			// We're going to end up with Promises that never resolve,
			// there seems to be no way to resolve them from this position.
			// warn that we didn't check this link
			let start = link.lineText.text.indexOf(link.address);
			let end = start + link.address.length;
			//diag = new Diagnostic(new Range(new Position(lineNumber,start),new Position(lineNumber,end)), `Internal error, sorry: ${link.address} was not checked`, DiagnosticSeverity.Warning);
			diag = new Diagnostic(new Range(new Position(lineNumber,start),new Position(lineNumber,end)), `${link.address} is unreachable and making the extension hang: ${error}`, DiagnosticSeverity.Error);
			gDiagnosticsArray.push(diag);
			gDiagnosticsCollection.set(gDocument.uri,gDiagnosticsArray);
			//source.cancel();
			//Promise.resolve(myPromise);
			//myPromise = null;
			// Make it look like the extension is not hanging.
			//myStatusBarItem.text = ``;
			//myStatusBarItem.show();
			//gOutputChannel.appendLine(`doALink.axiosPromise.catch1: end`);
		});
	} else {
		if (isNonHTTPLink(link.address)) {
			let bCheckMailtoDestFormat = gConfiguration.checkMailtoDestFormat;
			if (bCheckMailtoDestFormat && isMailtoLink(link.address)) {
				//gOutputChannel.appendLine(`doALink: Checking mailto link.`);
				if (!isWellFormedMailtoLink(link.address)) {
					let start = link.lineText.text.indexOf(link.address);
					let end = start + link.address.length;
					diag = new Diagnostic(new Range(new Position(lineNumber,start),new Position(lineNumber,end)), `${link.address}  is badly-formed.`, DiagnosticSeverity.Error);
					gDiagnosticsArray.push(diag);
					gDiagnosticsCollection.set(gDocument.uri,gDiagnosticsArray);
				}
			} else {
				let sReportNonHandledSchemes = gConfiguration.reportNonHandledSchemes;
				// as Error, as Warning, as Information, Don't report
				if (sReportNonHandledSchemes[0] != 'D') {
					//gOutputChannel.appendLine(`doALink: ${link.address} on line ${lineNumber} is non-HTTP* link; not checked.`);
					let start = link.lineText.text.indexOf(link.address);
					let end = start + link.address.length;
					var severity:DiagnosticSeverity = DiagnosticSeverity.Information;
					switch (sReportNonHandledSchemes[3]) {
						case 'E': severity = DiagnosticSeverity.Error; break;
						case 'W': severity = DiagnosticSeverity.Warning; break;
						case 'I': severity = DiagnosticSeverity.Information; break;
					}
					diag = new Diagnostic(new Range(new Position(lineNumber,start),new Position(lineNumber,end)), `${link.address}  is non-HTTP* link; not checked.`, severity);
					gDiagnosticsArray.push(diag);
					gDiagnosticsCollection.set(gDocument.uri,gDiagnosticsArray);
				}
			}
		} else {
			// Must be a relative path, but might not be, so try it...
			try {
				// Find the directory from the path to the current document
				var currentWorkingDirectory = path.dirname(gDocument.fileName);
				// Use that to resolve the full path from the relative link address
				// The `.split('#')[0]` at the end is so that relative links that also reference an anchor in the document will work with file checking.
				var fullPath = path.resolve(currentWorkingDirectory, link.address).split('#')[0];
				// Check if the file exists and log appropriately
				if (fs.existsSync(fullPath)) {
					//gOutputChannel.appendLine(`doALink: local file ${link.address} on line ${lineNumber} exists.`);
				} else {
					//gOutputChannel.appendLine(`doALink: local file ${link.address} on line ${lineNumber} does not exist.`);
					let start = link.lineText.text.indexOf(link.address);
					let end = start + link.address.length;
					diag = new Diagnostic(new Range(new Position(lineNumber,start),new Position(lineNumber,end)), `Local file  ${link.address}  does not exist.`, DiagnosticSeverity.Error);
					gDiagnosticsArray.push(diag);
					gDiagnosticsCollection.set(gDocument.uri,gDiagnosticsArray);
				}
			} catch (error) {
				// If there's an error, log the link
				//gOutputChannel.appendLine(`doALink: ${link.address} on line ${lineNumber} is not an HTTP/s or relative link.`);
			}
		}
	}

    //gOutputChannel.appendLine(`doALink: before Promise resolve`);
	if (myPromise == null) {
	    //gOutputChannel.appendLine(`doALink: creating resolved Promise`);
		myPromise = Promise.resolve();
	}
    //gOutputChannel.appendLine(`doALink: returning`);
	return myPromise;
}
 
// Parse the HTML Anchor links out of the document
function getLinks(document: TextDocument): Promise<Link[]> {
    //gOutputChannel.appendLine(`getLinks called, document.uri ${document.uri}`);
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
			// Anchor-href link looks like: <a href="urlhere" ... >
            var links = lineText.text.match(/<a\s+href="[^"]*"/g);
            if (links) {
                // Iterate over the links found on this line
                for (let i = 0; i< links.length; i++) {
                    // Get the URL from each individual link
                    var link = links[i].match(/<a\s+href="([^"]*)"/);
                    let address = link[1];
                    //Push it to the array
                    linksToReturn.push({
                        text: link[0],
                        address: address,
                        lineText: lineText
                    });
                }
            }
			// Img-src link looks like: <img src="urlhere" ... >
            links = lineText.text.match(/<img\s+src="[^"]*"/g);
            if (links) {
                // Iterate over the links found on this line
                for (let i = 0; i< links.length; i++) {
                    // Get the URL from each individual link
                    var link = links[i].match(/<img\s+src="([^"]*)"/);
                    let address = link[1];
                    //Push it to the array
                    linksToReturn.push({
                        text: link[0],
                        address: address,
                        lineText: lineText
                    });
                }
            }
			// Script-src link looks like: <script src="urlhere" ... >
            links = lineText.text.match(/<script\s+src="[^"]*"/g);
            if (links) {
                // Iterate over the links found on this line
                for (let i = 0; i< links.length; i++) {
                    // Get the URL from each individual link
                    var link = links[i].match(/<script\s+src="([^"]*)"/);
                    let address = link[1];
                    //Push it to the array
                    linksToReturn.push({
                        text: link[0],
                        address: address,
                        lineText: lineText
                    });
                }
            }
			// Link-href link looks like: <link href="urlhere" ... >
            links = lineText.text.match(/<link\s+href="[^"]*"/g);
            if (links) {
                // Iterate over the links found on this line
                for (let i = 0; i< links.length; i++) {
                    // Get the URL from each individual link
                    var link = links[i].match(/<link\s+href="([^"]*)"/);
                    let address = link[1];
                    //Push it to the array
                    linksToReturn.push({
                        text: link[0],
                        address: address,
                        lineText: lineText
                    });
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

// Is this a valid HTTP/S link?
function isHttpLink(UriToCheck: string): boolean {
	var bRetVal = UriToCheck.toLowerCase().startsWith('http://');
	if (!bRetVal)
		bRetVal = UriToCheck.toLowerCase().startsWith('https://');
	if (!bRetVal)
		bRetVal = UriToCheck.toLowerCase().startsWith('shttp://');
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
	var regex1 = /mailto:[a-z0-9\!\#\$\%\&\'\*\+\-\/\=\?\^\_\`\{\|\}\~\.\+\_]+@[a-z0-9\-\.]+$/i;
	var bRetVal = regex1.test(UriToCheck);
	if (!bRetVal) {
		var regex2 = /mailto:[a-z0-9\!\#\$\%\&\'\*\+\-\/\=\?\^\_\`\{\|\}\~\.\+\_]+@[a-z0-9\-\.]+\?.+/i;
		bRetVal = regex2.test(UriToCheck);
	}
    return bRetVal;
}

/*
// Generate a diagnostic object
function OldcreateDiagnostic(severity: DiagnosticSeverity, httpLink, lineText: TextLine, message): Diagnostic {
    // Get the location of the text in the document
    // based on position within the line of text it occurs in
    let startPos = lineText.text.indexOf(httpLink);
    let endPos = startPos + httpLink.length -1;
    let start = new Position(lineText.lineNumber,startPos);
    let end = new Position(lineText.lineNumber, endPos);
    let range = new Range(start, end);
    // Create the diagnostic object
    let diag = new Diagnostic(range, message, severity);
    // Return the diagnostic
    return diag;
}
*/
