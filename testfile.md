# Test file to check Markdown errors


![Using the extension](nosuchfile1.jpg "Using the extension")

[GitHub repo for this extension](nosuchfile2.html)

[Visual Studio Marketplace page for this extension](nosuchfile3.html)

[My web site](nosuchfile4.html)

these two should be okay
[hobbit-hole] [1]
[hobbit-hole][2]

[1]: <nosuchfile5.html> "Hobbit lifestyles"
[2]: nosuchfile6.html "Hobbit lifestyles"

### My Great Heading {#custom-id}

[Link to good heading](#custom-id)

[Link to bad heading](#bad-id)

### My Heading 2 {#dup-id}

this one should fail
### My Heading 3 {#dup-id}


### Another Heading

[Link to another heading](#another-heading)

this should be flagged as dup
#Another Heading


not a link, should be ignored ?
[*]: Project finished




# MARKDOWN

## lower case heading

### Another lower case heading

## UPPER CASE HEADING

## heading ( with (brackets)

## heading / with /slash

## heading - with -minus

## Links that are OK

[Already works with extension](#markdown)  
[substitute spaces with -](#lower-case-heading)  
[always use lower case](#upper-case-heading)  
[Number of # does not matter](#another-lower-case-heading)  
[Partly Ignore brackets](#heading--with-brackets)  
[Partly Ignore Slash](#heading--with-slash)  
[keep minus](#heading---with--minus)  
[More #1](#markdown)  

## Wrong links

[Completely Ignore brackets](#heading-with-brackets)  
[Completely Ignore Slash](#heading-with-slash)  
[Shows OK, but is wrong](#MARKDOWN)  
[Wrong handling of brackets](#heading---with--brackets)  
[Wrong handling of Slash](#heading---with--slash)  
[Wrong handling of minus](#heading--with-minus)  
[More #2](##markdown)  
