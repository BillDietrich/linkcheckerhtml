// Some things from 'vscode', which contains the VS Code extensibility API
import {
    workspace,
    window, 
    commands, 
    languages, 
    Diagnostic, 
    DiagnosticSeverity,
    DiagnosticCollection,
    Range,
    OutputChannel,
    Position,
    Uri,
    Disposable,
    TextDocument,
    TextLine,
    ViewColumn} from 'vscode';
// replacement for Promise which was removed from Node.js circa 2016
import rsvp = require('rsvp');
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

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(disposables: Disposable[]) {     
    //console.log("linkcheckerhtml: active");
    commands.registerCommand('extension.generateLinkReport', generateLinkReport);
    //console.log("linkcheckerhtml: finished activation");
}


// Generate a report of broken links and the line they occur on
function generateLinkReport() {
    // Get the current document
    let document = window.activeTextEditor.document;
    // Create an output channel for displaying broken links
    let outputChannel = window.createOutputChannel("linkcheckerhtml");
    // Show the output channel
    outputChannel.show(false);	// preserveFocus == false
    //outputChannel.appendLine(`linkcheckerhtml: generateLinkReport called`);

	//let webviewPanel = window.createWebviewPanel("", "linkcheckerhtml", ViewColumn.Beside);

    // Get all HTML Anchor lnks in the document
    getLinks(document).then((links) => {
	    //outputChannel.appendLine(`linkcheckerhtml: got ${links.length} links`);
        // Loop over the links
        links.forEach(link => {
		    //outputChannel.appendLine(`linkcheckerhtml: link on line ${link.lineText.lineNumber + 1} is "${link.address}"`);
            // Get the line number, because internally it's 0 based, but not in display
            let lineNumber = link.lineText.lineNumber + 1;
            
            // Is it an HTTP* link or a relative link?
            if(isHttpLink(link.address)) {
                // And check if they are broken or not.
                brokenLink(link.address, {allowRedirects: true}).then((answer) => {
                    // Log to the outputChannel
                    if(answer) {
                        outputChannel.appendLine(`Error: ${link.address} on line ${lineNumber} is unreachable.`);
                    } else {
                        outputChannel.appendLine(`Info: ${link.address} on line ${lineNumber} is accessible.`);
                    }
                });
            } else {
                if(isNonHTTPLink(link.address)) {
                    // We don't do anything with other URL types
                    outputChannel.appendLine(`Info: ${link.address} on line ${lineNumber} is non-HTTP* link; not checked.`);
                } else {
                    // Must be a relative path, but might not be, so try it...
                    try {
                        // Find the directory from the path to the current document
                        let currentWorkingDirectory = path.dirname(document.fileName);
                        // Use that to resolve the full path from the relative link address
                        // The `.split('#')[0]` at the end is so that relative links that also reference an anchor in the document will work with file checking.
                        let fullPath = path.resolve(currentWorkingDirectory, link.address).split('#')[0];
                        // Check if the file exists and log appropriately
                        if(fs.existsSync(fullPath)) {
                            outputChannel.appendLine(`Info: local file ${link.address} on line ${lineNumber} exists.`);
                        } else {
                            outputChannel.appendLine(`Error: local file ${link.address} on line ${lineNumber} does not exist.`);
                        }
                    } catch (error) {
                        // If there's an error, log the link
                        outputChannel.appendLine(`Error: ${link.address} on line ${lineNumber} is not an HTTP/s or relative link.`);
                    }
                }
            }
        });
    });
    //outputChannel.appendLine(`linkcheckerhtml: generateLinkReport returning`);
}
 
// Parse the HTML Anchor links out of the document
function getLinks(document: TextDocument): rsvp.Promise<Link[]> {
    console.log("linkcheckerhtml: getLinks called");
    // Return a promise, since this might take a while for large documents
    return new rsvp.Promise<Link[]>((resolve, reject) => {
        // Create arrays to hold links as we parse them out
        let linksToReturn = new Array<Link>();
        // Get lines in the document
        let lineCount = document.lineCount;
        
        //Loop over the lines in a document
        for(let lineNumber = 0; lineNumber < lineCount; lineNumber++) {
            // Get the text for the current line
            let lineText = document.lineAt(lineNumber);
            // Are there links?
			// HTML link looks like: <a href="urlhere">
            let links = lineText.text.match(/<[aA]\s+[hH][rR][eE][fF]="[^"]*"/g);
            if(links) {
                // Iterate over the links found on this line
                for(let i = 0; i< links.length; i++) {
                    // Get the URL from each individual link
                    var link = links[i].match(/<[aA]\s+[hH][rR][eE][fF]="([^"]*)"/);
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
        if(linksToReturn.length > 0) {
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

