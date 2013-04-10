if (!matrix.baseUrl) {
	matrix.baseUrl = "http://code.semanticsworks.com/assets/";
}

hm.groups.prettyprint = function( elem, path, elemGroup, options ) {
	$( elem ).html( prettyPrintOne( $( elem ).html() ) ).addClass( "code" );
};