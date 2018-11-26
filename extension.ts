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
// For checking broken links
import {
	AxiosPromise
	} from 'axios';
const axios = require('axios');

//Interface for links
interface Link {
    text: string
    address: string
    lineText: TextLine
}

let myStatusBarItem: StatusBarItem;
let diagnosticsCollection: DiagnosticCollection;
let gConfiguration: WorkspaceConfiguration;



// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(extensionContext:ExtensionContext) {     
    //let outputChannel = window.createOutputChannel("linkcheckerhtml");
    // Show the output channel
    //outputChannel.show(false);	// preserveFocus == false
    //outputChannel.appendLine(`linkcheckerhtml.activate: active`);
	//outputChannel.appendLine(`linkcheckerhtml.activate: uri = ${window.activeTextEditor.document.uri.toString()}`);
    //outputChannel.appendLine(`linkcheckerhtml.activate: visibleTextEditors.length = ${window.visibleTextEditors.length}`);

/*
    var diagnosticsCollection = languages.createDiagnosticCollection("linkcheckerhtml");
	var diagnosticsArray = new Array<Diagnostic>();
	var diag = new Diagnostic(new Range(new Position(1,10),new Position(2,20)), "message", DiagnosticSeverity.Error);
	diagnosticsArray.push(diag);
	diagnosticsCollection.set(window.activeTextEditor.document.uri,diagnosticsArray);
*/

    commands.registerCommand('extension.generateLinkReport', generateLinkReport);

	myStatusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, 0);
	extensionContext.subscriptions.push(myStatusBarItem);
	myStatusBarItem.hide();

	diagnosticsCollection = languages.createDiagnosticCollection("linkcheckerhtml");

    //outputChannel.appendLine(`linkcheckerhtml.activate: finished`);
}

// this method is called when your extension is deactivated
export function deactivate() {
	// delete any OS resources you allocated that are not
	// included in extensionContext.subscriptions
}

// Generate a report of broken links and the line they occur on
function generateLinkReport() {

    // Get the current document
    var document = window.activeTextEditor.document;

    // Create an output channel for displaying broken links
    //var outputChannel = window.createOutputChannel("linkcheckerhtml2");
    // Show the output channel
    //outputChannel.show(true);	// preserveFocus
    //outputChannel.appendLine(`linkcheckerhtml.generateLinkReport: called`);
    //outputChannel.appendLine(`linkcheckerhtml.generateLinkReport: uri = ${document.uri.toString()}`);
    //outputChannel.appendLine(`linkcheckerhtml.generateLinkReport: visibleTextEditors.length = ${window.visibleTextEditors.length}`);
    //document = window.visibleTextEditors[1].document;

	myStatusBarItem.text = `Checking for broken links ...`;
	myStatusBarItem.show();

    // Get all links in the document
    let p1 = getLinks(document);
	p1.then((links) => {
		// callback function for the "success" branch of the p1 Promise
		// Promise resolved now, so we're in a different context than before
	    //outputChannel.appendLine(`linkcheckerhtml.generateLinkReport: got ${links.length} links`);

		myStatusBarItem.text = `Checking ${links.length} links ...`;
		myStatusBarItem.show();

		gConfiguration = workspace.getConfiguration('linkcheckerhtml');

		var diagnosticsArray = new Array<Diagnostic>();
		var diag = null;
		diagnosticsCollection.set(window.activeTextEditor.document.uri,diagnosticsArray);

		let myPromises = new Array<AxiosPromise<Link[]>>();

/*
		diag = new Diagnostic(new Range(new Position(1,10),new Position(2,20)), "messageHHHH", DiagnosticSeverity.Error);
		diagnosticsArray.push(diag);
		diagnosticsCollection.set(window.activeTextEditor.document.uri,diagnosticsArray);

	    diagnosticsArray = languages.getDiagnostics(window.activeTextEditor.document.uri);
		diag = new Diagnostic(new Range(new Position(1,10),new Position(2,20)), "messageIIII", DiagnosticSeverity.Error);
		diagnosticsArray.push(diag);
		diagnosticsCollection.set(window.activeTextEditor.document.uri,diagnosticsArray);
*/

/*
		if (links.length == 0)
			myStatusBarItem.hide();
*/

        // Loop over the links
        links.forEach(link => {
		    //outputChannel.appendLine(`linkcheckerhtml.generateLinkReport: link on line ${link.lineText.lineNumber + 1} is "${link.address}"`);
            var lineNumber = link.lineText.lineNumber;
            
            // Is it an HTTP* link or a relative link?
            if (isHttpLink(link.address)) {
                // And check if they are broken or not.
                let bReportRedirectAsError = gConfiguration.reportRedirectAsError;
		    	//outputChannel.appendLine(`linkcheckerhtml.generateLinkReport: bReportRedirectAsError ${bReportRedirectAsError}`);
                //let p2 = axios.get(link.address, { redirect: (bReportRedirectAsError ? `error` : `follow`), timeout: 5000 });
                //let p2 = axios.get(link.address, { redirect: `follow`, timeout: 5000 });
                let p2 = axios.get(link.address, { validateStatus: null, maxRedirects: (bReportRedirectAsError ? 0 : 1), timeout: 8000 });
				myPromises.push(p2);
				p2.then(
					(response) =>
				{
					// callback function for the "result" branch of the p2 Promise
		    		//outputChannel.appendLine(`linkcheckerhtml.generateLinkReport: got response to p2 promise for ${response.requestUrl}: ${response.status} (${response.statusText})`);
					gConfiguration = workspace.getConfiguration('linkcheckerhtml');
		            let bReportRedirectAsError = gConfiguration.reportRedirectAsError;
                    if (((response.status > 400) && (response.status < 600))
							|| (bReportRedirectAsError && ((response.status > 300) && (response.status < 400)))) {
                        //outputChannel.appendLine(`Info: ${link.address} on line ${lineNumber} is unreachable.`);
					    diagnosticsArray = languages.getDiagnostics(window.activeTextEditor.document.uri);
						let start = link.lineText.text.indexOf(link.address);
						let end = start + link.address.length;
						diag = new Diagnostic(new Range(new Position(lineNumber,start),new Position(lineNumber,end)), `${link.address} is unreachable`+(bReportRedirectAsError?` or redirects; `:`; `)+`${response.status} (${response.statusText})`, DiagnosticSeverity.Error);
						diagnosticsArray.push(diag);
						diagnosticsCollection.set(window.activeTextEditor.document.uri,diagnosticsArray);
                    } else {
                        //outputChannel.appendLine(`Info: ${link.address} on line ${lineNumber} is accessible.`);
                    }
				}).catch(
				(all) =>
					{
                        //outputChannel.appendLine(`Info: ${link.address} catch-all`);
						// axios created a Promise but rejected starting it, somehow.
						// We're going to end up with Promises that never resolve,
						// there seems to be no way to resolve them from this position.
						// warn that we didn't check this link
					    diagnosticsArray = languages.getDiagnostics(window.activeTextEditor.document.uri);
						let start = link.lineText.text.indexOf(link.address);
						let end = start + link.address.length;
						diag = new Diagnostic(new Range(new Position(lineNumber,start),new Position(lineNumber,end)), `Internal error, sorry: ${link.address} was not checked`, DiagnosticSeverity.Warning);
						diagnosticsArray.push(diag);
						diagnosticsCollection.set(window.activeTextEditor.document.uri,diagnosticsArray);
						// Make it look like the extension is not hanging.
						myStatusBarItem.text = ``;
						myStatusBarItem.show();
					}
				);
            } else {
                if (isNonHTTPLink(link.address)) {
					gConfiguration = workspace.getConfiguration('linkcheckerhtml');
                    let bCheckMailtoDestFormat = gConfiguration.checkMailtoDestFormat;
					if (bCheckMailtoDestFormat && isMailtoLink(link.address)) {
						if (!isWellFormedMailtoLink(link.address)) {
							diagnosticsArray = languages.getDiagnostics(window.activeTextEditor.document.uri);
							let start = link.lineText.text.indexOf(link.address);
							let end = start + link.address.length;
							diag = new Diagnostic(new Range(new Position(lineNumber,start),new Position(lineNumber,end)), `${link.address}  is badly-formed.`, DiagnosticSeverity.Error);
							diagnosticsArray.push(diag);
							diagnosticsCollection.set(window.activeTextEditor.document.uri,diagnosticsArray);
						}
					} else {
	                    let bReportNonHandledSchemes = gConfiguration.reportNonHandledSchemes;
						if (bReportNonHandledSchemes) {
                    		//outputChannel.appendLine(`Info: ${link.address} on line ${lineNumber} is non-HTTP* link; not checked.`);
							diagnosticsArray = languages.getDiagnostics(window.activeTextEditor.document.uri);
							let start = link.lineText.text.indexOf(link.address);
							let end = start + link.address.length;
							diag = new Diagnostic(new Range(new Position(lineNumber,start),new Position(lineNumber,end)), `${link.address}  is non-HTTP* link; not checked.`, DiagnosticSeverity.Information);
							diagnosticsArray.push(diag);
							diagnosticsCollection.set(window.activeTextEditor.document.uri,diagnosticsArray);
						}
					}
                } else {
                    // Must be a relative path, but might not be, so try it...
                    try {
                        // Find the directory from the path to the current document
                        var currentWorkingDirectory = path.dirname(document.fileName);
                        // Use that to resolve the full path from the relative link address
                        // The `.split('#')[0]` at the end is so that relative links that also reference an anchor in the document will work with file checking.
                        var fullPath = path.resolve(currentWorkingDirectory, link.address).split('#')[0];
                        // Check if the file exists and log appropriately
                        if (fs.existsSync(fullPath)) {
                            //outputChannel.appendLine(`Info: local file ${link.address} on line ${lineNumber} exists.`);
                        } else {
                            //outputChannel.appendLine(`Error: local file ${link.address} on line ${lineNumber} does not exist.`);
						    diagnosticsArray = languages.getDiagnostics(window.activeTextEditor.document.uri);
							let start = link.lineText.text.indexOf(link.address);
							let end = start + link.address.length;
							diag = new Diagnostic(new Range(new Position(lineNumber,start),new Position(lineNumber,end)), `Local file  ${link.address}  does not exist.`, DiagnosticSeverity.Error);
							diagnosticsArray.push(diag);
							diagnosticsCollection.set(window.activeTextEditor.document.uri,diagnosticsArray);
                        }
                    } catch (error) {
                        // If there's an error, log the link
                        //outputChannel.appendLine(`Error: ${link.address} on line ${lineNumber} is not an HTTP/s or relative link.`);
                    }
                }
            }
        });
		
        let p3 = Promise.all(myPromises);
		p3.then((answer) =>
		{
			// all Promises are done, we've checked all the links
			myStatusBarItem.text = ``;
			myStatusBarItem.show();
		}
		);
    }
	);

    //outputChannel.appendLine(`linkcheckerhtml.generateLinkReport: returning`);
}
 
// Parse the HTML Anchor links out of the document
function getLinks(document: TextDocument): Promise<Link[]> {
    //console.log("linkcheckerhtml: getLinks called");
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
