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
	StatusBarAlignment
	} from 'vscode';
// replacement for Promise which was removed from Node.js circa 2016
//var promise = require('pinkie-promise');
//import rsvp = require('rsvp');
import fs = require('fs');
// For checking relative URIs against the local file system
import path = require('path');
// For checking broken links
//import brokenLink = require('broken-link');
import brokenLink = require('/usr/local/lib/node_modules/broken-link/index.js');

//Interface for links
interface Link {
    text: string
    address: string
    lineText: TextLine
}

let myStatusBarItem: StatusBarItem;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate({ subscriptions }: ExtensionContext) {     
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
	subscriptions.push(myStatusBarItem);
	myStatusBarItem.hide();

    //outputChannel.appendLine(`linkcheckerhtml.activate: finished`);
}

// this method is called when your extension is deactivated
export function deactivate() {
	myStatusBarItem.dispose();
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

    // Get all HTML Anchor links in the document
    let p1 = getLinks(document);
	p1.then((links) => {
		// callback function for the "success" branch of the p1 Promise
		// Promise resolved now, so we're in a different context than before
	    //outputChannel.appendLine(`linkcheckerhtml.generateLinkReport: got ${links.length} links`);

		var diagnosticsCollection = languages.createDiagnosticCollection("linkcheckerhtml");
		var diagnosticsArray = new Array<Diagnostic>();
		var diag = null;
		diagnosticsCollection.set(window.activeTextEditor.document.uri,diagnosticsArray);

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
                let p2 = brokenLink(link.address, {allowRedirects: true});
				p2.then((answer) =>
				{
					// callback function for the "success" branch of the p2 Promise
                    // Log to the outputChannel
                    if (answer) {
                        //outputChannel.appendLine(`Error: ${link.address} on line ${lineNumber} is unreachable.`);
					    diagnosticsArray = languages.getDiagnostics(window.activeTextEditor.document.uri);
						let start = link.lineText.text.indexOf(link.address);
						let end = start + link.address.length;
						//diag = new Diagnostic(new Range(new Position(15,10),new Position(5,20)), "messageZZZZZZZZ", DiagnosticSeverity.Error);
						diag = new Diagnostic(new Range(new Position(lineNumber,start),new Position(lineNumber,end)), `${link.address} is unreachable.`, DiagnosticSeverity.Error);
						diagnosticsArray.push(diag);
						diagnosticsCollection.set(window.activeTextEditor.document.uri,diagnosticsArray);
                    } else {
                        //outputChannel.appendLine(`Info: ${link.address} on line ${lineNumber} is accessible.`);
                    }
                }
				);
            } else {
                if (isNonHTTPLink(link.address)) {
                    // We don't do anything with other URL types
                    //outputChannel.appendLine(`Info: ${link.address} on line ${lineNumber} is non-HTTP* link; not checked.`);
					diagnosticsArray = languages.getDiagnostics(window.activeTextEditor.document.uri);
					let start = link.lineText.text.indexOf(link.address);
					let end = start + link.address.length;
					diag = new Diagnostic(new Range(new Position(lineNumber,start),new Position(lineNumber,end)), `${link.address} is non-HTTP* link; not checked.`, DiagnosticSeverity.Information);
					diagnosticsArray.push(diag);
					diagnosticsCollection.set(window.activeTextEditor.document.uri,diagnosticsArray);
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
							diag = new Diagnostic(new Range(new Position(lineNumber,start),new Position(lineNumber,end)), `Local file ${link.address} does not exist.`, DiagnosticSeverity.Error);
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
    }
	);
	//myStatusBarItem.text = `zzzzzzzzzzzzzzzzzzz`;
	//myStatusBarItem.show();
	//myStatusBarItem.hide();	// want to do this when all Promises are finished

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
			// HTML link looks like: <a href="urlhere">
            let links = lineText.text.match(/<a\s+href="[^"]*"/g);
            if (links) {
                // Iterate over the links found on this line
                for(let i = 0; i< links.length; i++) {
                    // Get the URL from each individual link
                    var link = links[i].match(/<a\s+href="([^"]*)"/);
                    let address = link[1];
					//var regex = /<a\s+href="([^"]*)"/i;
					//var match = regex.exec(links[i]);
					//var address = match[0];
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
function isHttpLink(linkToCheck: string): boolean {
	var bRetVal = linkToCheck.toLowerCase().startsWith('http://');
	if (!bRetVal)
		bRetVal = linkToCheck.toLowerCase().startsWith('https://');
	if (!bRetVal)
		bRetVal = linkToCheck.toLowerCase().startsWith('shttp://');
    return bRetVal;
}

// Is this a non-HTTP* link?
function isNonHTTPLink(linkToCheck: string): boolean {
	var bRetVal = linkToCheck.toLowerCase().startsWith('ftp://');
	if (!bRetVal)
		bRetVal = linkToCheck.toLowerCase().startsWith('mailto://');
	if (!bRetVal)
		bRetVal = linkToCheck.toLowerCase().startsWith('file://');
	if (!bRetVal)
		bRetVal = linkToCheck.toLowerCase().startsWith('irc://');
	if (!bRetVal)
		bRetVal = linkToCheck.toLowerCase().startsWith('ldap://');
	if (!bRetVal)
		bRetVal = linkToCheck.toLowerCase().startsWith('telnet://');
	if (!bRetVal)
		bRetVal = linkToCheck.toLowerCase().startsWith('sftp://');
	if (!bRetVal)
		bRetVal = linkToCheck.toLowerCase().startsWith('news://');
	if (!bRetVal)
		bRetVal = linkToCheck.toLowerCase().startsWith('news:');
    return bRetVal;
}


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
