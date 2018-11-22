
THIS PROJECT IS NOT USABLE YET !!!


##Functionality

Load an HTML file, then use Alt+L, and it will generate a report on the links in the document, including broken links. It attempts to check broken links by trying to resolve HTTP & HTTPS links, and relative links (../folder/file.html) by checking if the file exist on the local file system. The result of these checks are logged in an output window on the right of the editor.

Note that checking for broken links is more of an art than a science. Some sites don't actually return 404, but send you to a landing page. For example, Azure.com works this way. You can go to https://Azure.com/foo/bar and it will happily redirect you to https://Azure.com, with no 404 status returned. So take a status of "OK" with a grain of salt - you may not be arriving at the page you intend.

##Install

Open Visual Studio Code and press `F1`; a field will appear at the top of the window. Type `ext install linkcheckerhtml`, hit enter, and reload the window to enable.

##Check for broken links

To check for broken links, use Alt+L. This will open a new column to the right of the VSCode window and display the status of the links as they are checked.

##Changes

###0.2

* Copied from "Microsoft / linkcheckermd"
* Extension works, but output on debug channel only

##TODO

* Output into a normal window.
* Click on a broken-link notification and go to that line in source file.
* Register extension in Marketplace.
* Refactor broken link checking to display the actual URL that you arrived at for "OK" results that were redirects to a different URL.

##Development

I used these things:

* Linux Mint 19
* VSCode 1.29.1 (which says Node.js 8.9.3)
* node 8.10.0
* npm 3.5.2
* sudo npm -g install --save rsvp
* sudo npm -g install --save broken-link
* Yeoman

Ran Yeoman to make a Typescript test extension, then copied the entire
node_module directory tree to linkcheckerhtml directory.

