 /*!
  * Harmony JavaScript Library v0.1pre
  * © Fred Yang - http://semanticsworks.com
  * License: MIT (http://www.opensource.org/licenses/mit-license.php)
  * Include jquery.ba-bbq.js
  * Copyright (c) 2010 "Cowboy" Ben Alman
  *
  * Date: Wed May 29 10:13:33 2013 -0400
  */
(function( $, window, undefined ) {
	"use strict";

	/*jshint smarttabs:true, evil:true, expr:true, newcap: false, validthis: true */
	/**
	 * a wrapper over a Node constructor,
	 * [value] is optional
	 */
	var hm = window.hm = function( path, value ) {
			return new Node( path, value );
		},
		Node = function( path, value ) {
			path = path || "";
			this.path = toPhysicalPath( path, true /* create shadow if necessary */ );
			if (!isUndefined( value )) {
				this.set( value );
			}
		},
		document = window.document,
		localStorage = window.localStorage,
		setTimeout = window.setTimeout,
		history = window.history,
		location = window.location,
		alert = window.alert,
		confirm = window.confirm,
		hmFn,
		extend = $.extend,
		repository = {},
		isArray = $.isArray,
		isFunction = $.isFunction,
		primitiveTypes = { 'undefined': undefined, 'boolean': undefined, 'number': undefined, 'string': undefined },
		shadowNamespace = "__hm",
		rShadowKey = /^__hm\.([^\.]+?)(?:\.|$)/,
	//try to match xxx in string this.get("xxx")
		rWatchedPath = /this\.(?:get)\s*\(\s*(['"])([\*\.\w\/]+)\1\s*\)/g,

	//key is referencedPath
	//value is array of referencingPath
		referenceTable = {},
		defaultOptions = {},
		rootNode,
		shadowRoot = repository[shadowNamespace] = {},
		hasOwn = repository.hasOwnProperty,
		Array = window.Array,
		arrayPrototype = Array.prototype,
		stringPrototype = String.prototype,
		slice = arrayPrototype.slice,
		trigger,
		beforeUpdate = "beforeUpdate",
		afterUpdate = "afterUpdate",
		beforeCreate = "beforeCreate",
		afterCreate = "afterCreate",
		rJSON = /^(?:\{.*\}|\[.*\])$/,
		rUseParseContextAsContext = /^\.(\.*)([\.\*])/,
		rMainPath = /^\.<(.*)/,
		rBeginDotOrStar = /^[\.\*]/,
		rDotStar = /[\.\*]/,
		rHashOrDot = /#+|\./g,
		rHash = /#+/g,
		RegExp = window.RegExp,
		rParentKey = /^(.+)[\.\*]\w+$/,
		mergePath,
		rIndex = /^.+\.(\w+)$|\w+/,
		util,
		isUndefined,
		isPrimitive,
		isString,
		isObject,
		isBoolean,
		isNumeric = $.isNumeric,
		isPromise,
		toTypedValue,
		toPhysicalPath,
		toLogicalPath,
		clearObj,
		$fn = $.fn,
		clone,
		rSupplant = /\{([^\{\}]*)\}/g;

	//#debug
	//if you are using debug version of the library
	//you can use debugging facilities provided here
	//they are also used in unit test to test some internal variable which is
	//not exposed in production version
	//In debug version, you can turn on logging by setting hm.debug.enableLog = true
	//and turn on debugger by setting hm.debug.enableDebugger = true
	//
	//In production version, there is no logging or debugger facilities
	hm.debug = {};
	hm.debug.enableLog = true;
	hm.debug.enableDebugger = false;

	window.log = window.log || function() {
		if (hm.debug.enableLog && window.console) {
			console.log( Array.prototype.slice.call( arguments ) );
		}
	};
	//#end_debug


	function augment( prototype, extension ) {
		for (var key in extension) {
			if (!prototype[key]) {
				prototype[key] = extension[key];
			}
		}
	}

	augment( arrayPrototype, {
		indexOf: function( obj, start ) {
			for (var i = (start || 0); i < this.length; i++) {
				if (this[i] == obj) {
					return i;
				}
			}
			return -1;
		},

		contains: function( item ) {
			return (this.indexOf( item ) !== -1);
		},

		remove: function( item ) {
			var position = this.indexOf( item );
			if (position != -1) {
				this.splice( position, 1 );
			}
			return this;
		},

		removeAt: function( index ) {
			this.splice( index, 1 );
			return this;
		},

		pushUnique: function( item ) {
			if (!this.contains( item )) {
				this.push( item );
			}
			return this;
		},

		merge: function( items ) {
			if (items && items.length) {
				for (var i = 0; i < items.length; i++) {
					this.pushUnique( items[i] );
				}
			}
			return this;
		},
		//it can be sortObject()
		//sortObject(by)
		sortObject: function( by, asc ) {
			if (isUndefined( asc )) {
				if (isUndefined( by )) {
					asc = true;
					by = undefined;
				} else {
					if (isString( by )) {
						asc = true;
					} else {
						asc = by;
						by = undefined;
					}
				}
			}

			if (by) {
				this.sort( function( a, b ) {
					var av = a[by];
					var bv = b[by];
					if (av == bv) {
						return 0;
					}
					return  asc ? (av > bv) ? 1 : -1 :
						(av > bv) ? -1 : 1;
				} );
			} else {
				asc ? this.sort() : this.sort().reverse();
			}
			return this;
		}
	} );

	augment( stringPrototype, {
		startsWith: function( text ) {
			return this.indexOf( text ) === 0;
		},
		contains: function( text ) {
			return this.indexOf( text ) !== -1;
		},
		endsWith: function( suffix ) {
			return this.indexOf( suffix, this.length - suffix.length ) !== -1;
		},
		supplant: function( obj ) {
			return this.replace( rSupplant,
				function( a, b ) {
					var r = obj[b];
					return typeof r ? r : a;
				} );
		},
		format: function() {
			var source = this;
			$.each( arguments, function( index, value ) {
				source = source.replace( new RegExp( "\\{" + index + "\\}", "g" ), value );
			} );
			return source;
		}
	} );

	hmFn = Node.prototype = hm.fn = hm.prototype = {

		constructor: Node,

		toString: function() {
			return this.path;
		},

		//get()
		//get(true)
		//
		//subPath can be null, undefined, "", or "any string"
		//get(subPath)
		//get(subPath, p1, p2)
		//
		//does not support the following, as will be implemented as get((subPath = p1), p2)
		//get(p1, p2)
		get: function( subPath /*, p1, p2, .. for parameters of model functions*/ ) {

			var currentValue, accessor = this.accessor( subPath, true );

			if (accessor) {

				if (isFunction( accessor.hostObj )) {

					return accessor.hostObj.apply( this.cd( ".." ), slice.call( arguments ) );

				}
				else {

					currentValue = !accessor.index ?
						accessor.hostObj :
						accessor.hostObj[accessor.index];

					if (isFunction( currentValue )) {

						//inside the function, "this" refer the parent model of accessor.physicalPath
						return currentValue.apply( this.cd( subPath ).cd( ".." ), slice.call( arguments, 1 ) );

					} else {

						return currentValue;
					}
				}
			}
			//else return undefined
		},

		getJson: function() {
			return JSON.stringify( this.get.apply( this, slice.call( arguments ) ) );
		},

		raw: function( subPath, value ) {
			var accessor;
			if (isFunction( subPath )) {
				value = subPath;
				subPath = "";
			}
			if (!value) {
				accessor = this.accessor( subPath, true );
				if (accessor) {
					return !accessor.index ?
						accessor.hostObj :
						accessor.hostObj[accessor.index];
				}
			} else {
				accessor = this.accessor( subPath );
				return ( accessor.index in accessor.hostObj ) ?
					this.update( subPath, value, accessor ) :
					this.create( subPath, value, accessor );
			}

		},

		//return node
		//you can use node.set to call the function at the path
		//the function context is bound to current proxy's parent
		//what is different for get function is that, set will return a proxy
		//and get will return the result of the function
		set: function( force, subPath, value ) {
			//allow set(path, undefined)
			if (arguments.length == 1) {
				if (this.path === "") {
					throw "root object can not changed";
				} else {
					rootNode.set( this.path, force, subPath );
					return this;
				}
			}

			var args = slice.call( arguments );

			if (!isBoolean( force )) {
				value = subPath;
				subPath = force;
				force = false;
			} else if (arguments.length == 2) {
				rootNode.set( force, this.path, subPath );
				return this;
			}

			var accessor = this.accessor( subPath );
			var currentValue = accessor.hostObj[accessor.index];

			if (isFunction( currentValue )) {

				//inside the function, "this" refer the parent model of accessor.physicalPath
				currentValue.apply( this.cd( subPath ).cd( ".." ), slice.call( args, 1 ) );
				return this;

			} else {

				return ( accessor.index in accessor.hostObj ) ?
					this.update( force, subPath, value, accessor ) :
					this.create( force, subPath, value, accessor );

			}
		},

		accessor: function( subPath, readOnly /*internal use only*/ ) {
			//if it is not readOnly, and access out of boundary, it will throw exception
			if (subPath === 0) {
				subPath = "0";
			}

			var i,
				index,
			//the hostObj start from root
				hostObj = repository,
			//the fullPath can be logicalPath , for example hm("person").getPath("*");
			//it can also be a physicalPath like hm("person*").getPath();
				fullPath = this.getPath( subPath ),
			//make sure we are working on a physicalPath
				physicalPath = toPhysicalPath( fullPath, true /*create shadow if necessary*/ ),
				parts = physicalPath.split( "." );

			if (parts.length === 1) {

				index = physicalPath;

			} else {

				//index is the last part
				index = parts[parts.length - 1];

				//traverse to the second last node in the parts hierarchy
				for (i = 0; i < parts.length - 1; i++) {
					hostObj = hostObj[parts[i]];
					if (hostObj === undefined) {
						break;
					}
				}
			}

			if (isPrimitive( hostObj )) {
				if (readOnly) {
					return;
				}
				else {
					throw "invalid update on unreachable node '" + toLogicalPath( fullPath ) + "'";
				}
			}

			return {
				physicalPath: physicalPath,
				hostObj: hostObj,
				index: index
			};
		},

		create: function( force, subPath, value, accessor /* accessor is used internally */ ) {

			if (!isBoolean( force )) {
				accessor = value;
				value = subPath;
				subPath = force;
				force = false;
			}

			accessor = accessor || this.accessor( subPath );

			var physicalPath = accessor.physicalPath;

			var hostObj = accessor.hostObj,
				index = accessor.index,
				isHostObjArray = isArray( hostObj );

			if (isHostObjArray && isNumeric( index )) {
				if (index > hostObj.length) {
					throw "you can not add item with hole in array";
				}
			} else {
				if (index in hostObj) {
					throw "value at path: '" + toLogicalPath( accessor.physicalPath ) + "' has been defined, " +
					      "try use update method instead";
				}
			}

			if (!force && trigger( physicalPath, physicalPath, beforeCreate, value ).hasError()) {
				return false;
			}

			if (isHostObjArray && isNumeric( index )) {
				if (index == hostObj.length) {
					hostObj[index] = value;

				} else if (index < hostObj.length) {
					//insert an item x into array [ 1, 2, 3] at position 2,
					// and it becomes [1, x, 2, 3]
					hostObj.splice( accessor.index, 0, value );
				}

			} else {
				hostObj[accessor.index] = value;
			}

			traverseModel( physicalPath, value );
			trigger( physicalPath, physicalPath, afterCreate, value );
			return this;
		},

		extend: function( subPath, object ) {
			var newModel;
			if (!object) {
				object = subPath;
				newModel = this;
			} else {
				newModel = this.cd( subPath );
			}
			for (var key in object) {
				newModel.set( key, object[key] );
			}
			return this;
		},

		/* accessor is used internally */
		//update(value)
		//update(subPath, value)
		//most of the time force is not used, by default is it is false
		//by in case you want to bypass validation you can explicitly set to true
		update: function( force, subPath, value, accessor ) {

			if (arguments.length == 1) {
				if (this.path === "") {
					throw "root object can not updated";
				} else {
					rootNode.update( this.path, force );
					return this;
				}
			}

			if (!isBoolean( force )) {
				accessor = value;
				value = subPath;
				subPath = force;
				force = false;
			} else if (arguments.length == 2) {
				rootNode.update( force, this.path, subPath );
				return this;
			}

			accessor = accessor || this.accessor( subPath );

			if (!( accessor.index in accessor.hostObj )) {
				throw "value at path: '" + toLogicalPath( accessor.physicalPath ) + "' has been not defined, " +
				      "try use create method instead";
			}

			var physicalPath = accessor.physicalPath;

			var originalValue = accessor.hostObj[accessor.index];
			//use "==" is purposeful, we want it to be flexible.
			// If model value is null, and textBox value is "", because null == "",
			// so that "" can not be set, same for "9" and 9
			if (originalValue == value) {
				return this;
			}

			if (!force && trigger( physicalPath, physicalPath, beforeUpdate, value, originalValue ).hasError()) {
				return false;
			}

			accessor.hostObj[accessor.index] = value;

			traverseModel( physicalPath, value );

			if (!force) {
				trigger( physicalPath, physicalPath, afterUpdate, value, originalValue );
			}

			return this;
		},

		del: function( subPath ) {
			if (isUndefined( subPath )) {
				if (this.path) {
					return rootNode.del( this.path );
				}
				throw "root can not be deleted";
			}

			var accessor = this.accessor( subPath ),
				hostObj = accessor.hostObj,
				physicalPath = accessor.physicalPath,
				removedValue = hostObj[accessor.index],
				isHostObjectArray = isArray( hostObj );

			if (trigger( physicalPath, physicalPath, "beforeDel", undefined, removedValue ).hasError()) {
				return false;
			}

			trigger( physicalPath, physicalPath, "duringDel", undefined, removedValue );

			if (isHostObjectArray) {

				hostObj.splice( accessor.index, 1 );

			} else {

				delete hostObj[accessor.index];

			}

			for (var i = 0; i < onDeleteHandlers.length; i++) {
				onDeleteHandlers[i]( physicalPath, removedValue );
			}

			trigger( physicalPath, physicalPath, "afterDel", undefined, removedValue );
			return removedValue;
		},

		createIfUndefined: function( subPath, value ) {
			if (isUndefined( value )) {
				throw "missing value argument";
			}
			var accessor = this.accessor( subPath );
			return ( accessor.index in accessor.hostObj ) ?
				this :
				this.create( subPath, value, accessor );
		},

		toggle: function( subPath ) {

			var accessor = this.accessor( subPath );
			if (accessor.index in accessor.hostObj) {
				this.update( subPath, !accessor.hostObj[accessor.index], accessor );
			}
			return this;
		},

		//navigation methods
		pushStack: function( newNode ) {
			newNode.previous = this;
			return newNode;
		},

		cd: function( relativePath ) {
			return this.pushStack( hm( this.getPath( relativePath ) ) );
		},

		parent: function() {
			return this.cd( ".." );
		},

		shadow: function() {
			return this.cd( "*" );
		},

		sibling: function( path ) {
			return this.cd( ".." + path );
		},

		main: function() {

			return this.pushStack( hm( getMainPath( this.path ) ) );
		},

		//--------------path methods---------------
		getPath: function( subPath ) {
			//join the context and subPath together, but it is still a logical path
			return mergePath( this.path, subPath );
		},

		//to get the logicalPath of current model, leave subPath empty
		logicalPath: function( subPath ) {
			return toLogicalPath( this.getPath( subPath ) );
		},

		//to get the physicalPath of current model, leave subPath empty
		physicalPath: function( subPath ) {
			return toPhysicalPath( this.getPath( subPath ) );
		},

		pathContext: function() {
			return contextOfPath( this.path );
		},

		pathIndex: function() {
			return indexOfPath( this.path );
		},

		//call the native method of the wrapped value
		invoke: function( methodName /*, p1, p2, ...*/ ) {
			if (arguments.length === 0) {
				throw "methodName is missing";
			}

			var context = this.get();
			return context[methodName].apply( context, slice.call( arguments, 1 ) );
		},

		//region array methods
		indexOf: function( item ) {
			return this.get().indexOf( item );
		},

		contains: function( item ) {
			return (this.indexOf( item ) !== -1);
		},

		first: function( fn ) {
			return fn ? this.filter( fn )[0] : this.get( "0" );
		},

		last: function() {
			var value = this.get();
			return value[value.length - 1];
		},

		push: function( item ) {
			return this.create( this.get().length, item );
		},

		pushRange: function( items ) {
			for (var i = 0; i < items.length; i++) {
				this.push( items[i] );
			}
			return this;
		},

		pushUnique: function( item ) {
			return !this.contains( item ) ?
				this.push( item ) :
				this;
		},

		pop: function() {
			return this.removeAt( this.get().length - 1 );
		},

		shift: function() {
			return this.del( 0 );
		},

		unshift: function( item ) {
			return this.create( 0, item );
		},

		insertAt: function( index, item ) {
			return this.create( index, item );
		},

		updateAt: function( index, item ) {
			return this.update( index, item );
		},

		removeAt: function( index ) {
			return this.del( index );
		},

		move: function( fromIndex, toIndex ) {
			var count = this.count();

			if (fromIndex !== toIndex &&
			    fromIndex >= 0 && fromIndex < count &&
			    toIndex >= 0 && toIndex < count) {

				var item = this.del( fromIndex );
				this.insertAt( toIndex, item );
				trigger( this.path, this.path, "move", toIndex, fromIndex );
			}
			return this;
		},

		replaceItem: function( oldItem, newItem ) {
			if (oldItem == newItem) {
				return this;
			}

			var index = this.indexOf( oldItem );

			if (index != -1) {
				return this.updateAt( index, newItem );
			}
			return this;
		},

		removeItem: function( item ) {
			var index = this.indexOf( item );
			return index !== -1 ? this.removeAt( index ) : this;
		},

		removeItems: function( items ) {
			for (var i = 0; i < items.length; i++) {
				this.removeItem( items[i] );
			}
			return this;
		},

		clear: function() {
			var items = this.get(),
				oldItems = items.splice( 0, items.length );

			trigger( this.path, this.path, "afterCreate", items, oldItems );
			return this;
		},

		count: function() {
			return this.get().length;
		},

		//fn is like function (index, item) { return item == 1; };
		filter: function( fn ) {
			return $( this.get() ).filter( fn ).get();
		},

		each: function( directAccess, fn ) {
			if (!isBoolean( directAccess )) {
				fn = directAccess;
				directAccess = false;
			}

			var hasChange, i, status, items;

			if (directAccess) {

				items = this.get();

				for (i = items.length - 1; i >= 0; i--) {
					//this in the fn refer to the parent array
					status = fn( i, items[i], items );
					if (status === true) {
						hasChange = true;
					} else if (status === false) {
						break;
					}
				}

				if (hasChange) {
					this.triggerChange();
				}

			} else {
				for (i = this.count() - 1; i >= 0; i--) {
					//this in the fn, refer to the parent model
					var itemModel = this.cd( i );
					if (fn.call( itemModel, i, itemModel, this ) === false) {
						break;
					}
				}
			}
			return this;
		},

		map: function( fn ) {
			return $.map( this.get(), fn );
		},

		sort: function( by, asc ) {
			return trigger( this.path, this.path, "afterUpdate", this.get().sortObject( by, asc ) );
		},
		//#endregion

		//-------model link method -----------
		reference: function( /*targetPath1, targetPath2, ..*/ ) {
			for (var i = 0; i < arguments.length; i++) {
				reference( this.path, arguments[i] );
			}
			return this;
		},

		dereference: function( /*targetPath1, targetPath2, ..*/ ) {
			for (var i = 0; i < arguments.length; i++) {
				dereference( this.path, arguments[i] );
			}
			return this;
		},

		//endregion

		//-------other methods---------
		isEmpty: function( subPath ) {
			var value = this.get( subPath );
			return !value ? true :
				!isArray( value ) ? false :
					(value.length === 0);
		},

		isShadow: function() {
			return this.path.startsWith( shadowNamespace );
		},

		toJSON: function( subPath ) {
			return JSON.stringify( this.get( subPath ) );
		},

		compare: function( expression ) {
			if (expression) {
				expression = toTypedValue( expression );
				if (isString( expression )) {
					if (this.get() == expression) {
						return true;
					} else {
						try {
							return eval( "this.get()" + expression );
						} catch (e) {
							return false;
						}
					}
				} else {
					return this.get() == expression;
				}
			} else {
				return this.isEmpty();
			}
		},

		saveLocal: function( subPath ) {
			util.local( this.getPath( subPath ), this.get() );
			return this;
		},

		getLocal: function( subPath ) {
			return util.local( this.getPath( subPath ) );
		},

		restoreLocal: function( subPath ) {
			rootNode.set( this.getPath( subPath ), this.getLocal( subPath ) );
			return this;
		},

		clearLocal: function( subPath ) {
			util.local( this.getPath( subPath ), undefined );
			return this;
		}

	};

	function expandToHashes( $0 ) {
		return $0 === "." ? "#" : //if it is "." convert to "#"
			new Array( $0.length + 2 ).join( "#" ); ////if it is "#" convert to "##"
	}

	var onAddOrUpdateHandlers = [function /*inferNodeDependencies*/ ( context, index, value ) {

		//only try to parse function body
		//if it is a parameter-less function
		//or it has a magic function name "_"
		if (!isFunction( value ) || (value.name && value.name.startsWith( "_" ))) {
			return;
		}

		var functionBody = value.toString(),
			path = context ? context + "." + index : index,
			watchedPaths = inferDependencies( functionBody );

		for (var i = 0; i < watchedPaths.length; i++) {
			reference( path, context ? mergePath( context, watchedPaths[i] ) : watchedPaths[i] );
		}
	}];

	function processNewNode( contextPath, indexPath, modelValue ) {
		for (var i = 0; i < onAddOrUpdateHandlers.length; i++) {
			onAddOrUpdateHandlers[i]( contextPath, indexPath, modelValue );
		}
	}

	function getMainPath( shadowPath ) {
		if (shadowPath === shadowNamespace) {
			return "";
		}
		var match = rShadowKey.exec( shadowPath );
		return match ? convertShadowKeyToMainPath( match[1] ) : shadowPath;
	}

	function convertShadowKeyToMainPath( key ) {
		return key.replace( rHash, reduceToDot );
	}

	function reduceToDot( hashes ) {
		return hashes == "#" ? "." : // if is # return .
			new Array( hashes.length ).join( "#" ); // if it is ## return #
	}

	/* processCurrent is used internally, don't use it */
	function traverseModel( modelPath, modelValue, processCurrent ) {
		var contextPath,
			indexPath,
			indexOfLastDot = modelPath.lastIndexOf( "." );

		if (isUndefined( processCurrent )) {
			processCurrent = true;
		}

		if (processCurrent) {

			if (indexOfLastDot === -1) {
				contextPath = "";
				indexPath = modelPath;
			} else {
				contextPath = modelPath.substring( 0, indexOfLastDot );
				indexPath = modelPath.substring( indexOfLastDot + 1 );
			}

			processNewNode( contextPath, indexPath, modelValue );
		}

		if (!isPrimitive( modelValue )) {

			for (indexPath in modelValue) {

				//do not remove the hasOwnProperty check!!
				//if (hasOwn.call( modelValue, index )) {
				processNewNode( modelPath, indexPath, modelValue[indexPath] );
				traverseModel( modelPath + "." + indexPath, modelValue[indexPath], false );
				//}
			}
		}
	}

	function reference( referencingPath, referencedPath ) {
		referencedPath = toPhysicalPath( referencedPath );
		var referencingPaths = referenceTable[referencedPath];
		if (!referencingPaths) {
			referenceTable[referencedPath] = referencingPaths = [];
		}
		referencingPaths.pushUnique( referencingPath );
	}

	function dereference( referencingPath, referencedPath ) {
		referencedPath = toPhysicalPath( referencedPath );
		var referencingPaths = referenceTable[referencedPath];
		referencingPaths.remove( referencingPath );
		if (!referencingPaths.length) {
			delete referenceTable[referencedPath];
		}
	}

	function inferDependencies( functionBody ) {
		var memberMatch,
			rtn = [];

		while ((memberMatch = rWatchedPath.exec( functionBody ) )) {
			rtn.pushUnique( memberMatch[2] );
		}
		return rtn;
	}

	function contextOfPath( path ) {
		var match = rParentKey.exec( path );
		return match && match[1] || "";
	}

	function indexOfPath( path ) {
		var match = rIndex.exec( path );
		return match[1] || match[0];
	}

	var dummy = {};

	var Class = function _( seed ) {
		var temp;

		if (!(this instanceof _)) {
			temp = new _( dummy );
			return _.apply( temp, arguments );
		}

		if (arguments[0] === dummy) {
			return this;
		}

		this.initialize.apply( this, arguments );
		return this;
	};

	var superPrototype;
	extend( Class.prototype, {

		callProto: function( methodName ) {
			var method = this.constructor.prototype[methodName];
			return method.apply( this, slice.call( arguments, 1 ) );
		},

		//instance.callBase("method1", p1, p2,...);
		callBase: function( methodName ) {
			//superPrototype is global object, we use this
			// because assume js in browser is a single threaded

			//starting from "this" instance
			superPrototype = superPrototype || this;
			superPrototype = superPrototype.constructor.__super__;

			if (!superPrototype) {
				return;
			}

			var method = superPrototype[methodName];
			var rtn = method.apply( this, slice.call( arguments, 1 ) );

			//when it done, set it back to null
			superPrototype = null;
			return rtn;
		},

		/* the subType's initialize should be like
		 *
		 initialize: function( seed ) {
		 //do things
		 this.callBase( "initialize", seed );
		 },
		 */
		//the default initialize is to extend the instance with seed data
		initialize: function( seed ) {
			extend( this, seed );
		},

		//this function will be called when JSON.stringify() is called
		toJSON: function() {
			var rtn = extend( true, {}, this );

			for (var key in rtn) {
				if (key.startsWith( "__" )) {
					delete rtn[key];
				}
			}
			return rtn;
		}

	} );

	extend( Class, {

		//create an array of items of the same type
		//if You have a subType called Person
		//you can Person.list([ seed1, seed2 ]);
		//to create an array of typed items
		list: function( seeds ) {

			var i,
				seed,
				rtn = [],
				itemIsObject;

			if (isUndefined( seeds )) {

				return rtn;

			} else {

				if (!isArray( seeds )) {

					seeds = slice.call( arguments );

				}

				itemIsObject = seeds.itemIsObject;

				for (i = 0; i < seeds.length; i++) {
					seed = seeds[i];

					rtn.push(
						itemIsObject || !isArray( seed ) ?
							seeds instanceof this ? this : new this( seed ) :
							this.apply( null, seed )
					);
				}

			}

			return rtn;
		},

		//to create a new Type call

		extend: function( instanceMembers, staticMembers ) {
			var Child,
				Parent = this;

			// The constructor function for the new subclass is either defined by you
			// (the "constructor" property in your `extend` definition), or defaulted
			// by us to simply call the parent's constructor.
			if (instanceMembers && instanceMembers.hasOwnProperty( "constructor" )) {
				Child = instanceMembers.constructor;
			} else {
				Child = function _() {
					var temp;

					if (!(this instanceof _)) {
						temp = new _( dummy );
						return _.apply( temp, arguments );
					}

					if (arguments[0] === dummy) {
						return this;
					}
					//this is similar like : base(arguments)
					Parent.apply( this, arguments );
					return this;
				};
			}

			// Add static properties to the constructor function, if supplied.
			extend( Child, Parent, staticMembers );

			// Set the prototype chain to inherit from `parent`, without calling
			// `parent`'s constructor function.
			var Surrogate = function() { this.constructor = Child; };
			Surrogate.prototype = Parent.prototype;
			Child.prototype = new Surrogate();

			// Add prototype properties (instance properties) to the subclass,
			// if supplied.
			if (instanceMembers) {
				extend( Child.prototype, instanceMembers );
			}

			// Set a convenience property in case the parent's prototype is needed
			// later.
			Child.__super__ = Parent.prototype;

			return Child;
		}

	} );

	//helpers
	extend( hm, {

		Class: Class,

		util: util = {

			//user do not need to use createShadowIfNecessary parameter
			//it is for internal use
			//it is only used in two places. It is, when a model is created
			// and when accessor is build,
			// even in these two case when the parameter is true,
			// shadow is not necessary created
			// it is only created when
			// the the physical path is pointing to a shadow
			// and the main model has been created
			// and the shadow's parent is an object
			toPhysicalPath: toPhysicalPath = function( logicalPath, createShadowIfNecessary /* internal use*/ ) {

				var match, rtn = "", leftContext = "", mainValue, shadowKey, mainPath;

				while ((match = rDotStar.exec( logicalPath ))) {
					//reset logical Path to the remaining of the search text
					logicalPath = RegExp.rightContext;
					leftContext = RegExp.leftContext;

					if (match[0] == ".") {

						if (rtn) {
							//mainPath = rtn + "." + leftContext
							if (rtn == shadowNamespace && createShadowIfNecessary && !shadowRoot[leftContext]) {
								mainPath = convertShadowKeyToMainPath( leftContext );
								if (!isUndefined( rootNode.get( mainPath ) )) {
									shadowRoot[leftContext] = {};
								}
								//!isUndefined( rootNode.get( mainPath ) )
								/*	if (createShadowIfNecessary &&
								 !shadowRoot[shadowKey] &&
								 rtn != shadowNamespace &&
								 !isUndefined( mainValue = rootNode.get( mainPath ) )) {
								 */
							}
							rtn = rtn + "." + leftContext;
							//shadowRoot[shadowKey]
							//if (rtn ==)
						} else {
							rtn = leftContext;
						}

					} else {

						//if match is "*", then it is shadow
						//if rtn is not empty so far
						if (rtn) {
							//shadowKey will be
							//convertMainPathToShadowKey
							shadowKey = ( rtn ? rtn.replace( rHashOrDot, expandToHashes ) : rtn) + "#" + leftContext;
							mainPath = rtn + "." + leftContext;
						} else {
							if (leftContext) {
								shadowKey = leftContext;
								mainPath = leftContext;

							} else {

								shadowKey = "";
								mainPath = "";
							}
						}

						rtn = shadowNamespace + (shadowKey ? "." + shadowKey : "");

						//only when main model exists , and host of the object exists
						//then create shadow
						if (createShadowIfNecessary && !shadowRoot[shadowKey] &&
						    rtn != shadowNamespace && !isUndefined( mainValue = rootNode.get( mainPath ) )) {

							shadowRoot[shadowKey] = {};
						}
					}
				}

				return !logicalPath ? rtn :
					rtn ? rtn + "." + logicalPath :
						logicalPath;
			},
			toLogicalPath: toLogicalPath = function( physicalPath ) {

				var index, logicalPath, mainPath, match;

				if (physicalPath === shadowNamespace) {
					return "*";
				}

				match = rShadowKey.exec( physicalPath );
				if (match) {
					// if physical path is like __hm.key.x
					// convert the key path into mainPath
					index = RegExp.rightContext;
					mainPath = convertShadowKeyToMainPath( match[1] );
					logicalPath = mainPath + "*" + index;
					return toLogicalPath( logicalPath );

				} else {

					return physicalPath;
				}

			},

			/*join the context and subPath together, if path is not necessary the same as logical path
			 *convertSubPathToRelativePath by default is true, so that if you specify subPath as "b"
			 * and  context is "a", it will be merged to "a.b" . If explicitly specify
			 * convertSubPathToRelativePath to false, they will not be merged, so the "b" will be
			 * returned as merge path*/
			mergePath: mergePath = function( contextPath, subPath, convertSubPathToRelativePath
			                                 /*used internally*/ ) {
				if (subPath == "_") {

					return "_";

				} else if (contextPath == "_") {

					if (subPath && subPath.startsWith( "/" )) {

						contextPath = "";

					} else {

						return "_";
					}
				}

				contextPath = toPhysicalPath( contextPath );

				var match;
				if (!isUndefined( subPath ) && subPath !== null) {
					subPath = subPath + "";
					if (subPath.startsWith( "/" )) {
						return subPath.substr( 1 );
					}
				}
				if (isUndefined( convertSubPathToRelativePath )) {
					convertSubPathToRelativePath = true;
				}

				if (convertSubPathToRelativePath && subPath && contextPath && !rBeginDotOrStar.test( subPath )) {
					subPath = "." + subPath;
				}

				if (!subPath || subPath == ".") {

					return contextPath;

				} else if (!rBeginDotOrStar.test( subPath )) {

					return subPath;

				} else if ((match = rUseParseContextAsContext.exec( subPath ))) {
					//if subPath is like ..xyz or .*xyz
					var stepsToGoUp = 1 + (match[1] ? match[1].length : 0),
						remaining = RegExp.rightContext,
						mergedContext = contextPath;

					while (stepsToGoUp) {
						mergedContext = contextOfPath( mergedContext );
						stepsToGoUp--;
					}

					//use rule's context as context
					//.. or .*
					//$2 is either "." or "*"
					return remaining ?
						(mergedContext ? mergedContext + match[2] + remaining : remaining) :
						(match[2] === "*" ? mergedContext + "*" : mergedContext);

					//if subPath is like .ab or *ab
				} else if ((match = rMainPath.exec( subPath ))) {

					return mergePath( getMainPath( contextPath ), match[1] );

				}
				return contextPath + subPath;
			},

			isUndefined: isUndefined = function( obj ) {
				return (obj === undefined);
			},
			isPrimitive: isPrimitive = function( obj ) {
				return (obj === null ) || (typeof(obj) in primitiveTypes);
			},
			isString: isString = function( val ) {
				return typeof val === "string";
			},
			isObject: isObject = function( val ) {
				return $.type( val ) === "object";
			},
			isBoolean: isBoolean = function( object ) {
				return typeof object === "boolean";
			},
			toTypedValue: toTypedValue = function( stringValue ) {
				if (isString( stringValue )) {
					stringValue = $.trim( stringValue );
					try {
						stringValue = stringValue === "true" ? true :
							stringValue === "false" ? false :
								stringValue === "null" ? null :
									stringValue === "undefined" ? undefined :
										isNumeric( stringValue ) ? parseFloat( stringValue ) :
											//Date.parse( stringValue ) ? new Date( stringValue ) :
											rJSON.test( stringValue ) ? $.parseJSON( stringValue ) :
												stringValue;
					} catch (e) {}
				}
				return stringValue;
			},
			isPromise: isPromise = function( object ) {
				return !!(object && object.promise && object.done && object.fail);
			},
			clearObj: clearObj = function( obj ) {
				if (isPrimitive( obj )) {
					return null;
				}
				for (var key in obj) {
					if (hasOwn.call( obj, key )) {
						obj[key] = clearObj( obj[key] );
					}
				}
				return obj;
			},
			clone: clone = function( original, deepClone ) {
				return isPrimitive( original ) ? original :
					isArray( original ) ? original.slice( 0 ) :
						isFunction( original ) ? original :
							extend( !!deepClone, {}, original );
			},

			local: function( key, value ) {
				if (arguments.length == 1) {
					return JSON.parse( localStorage.getItem( key ) );
				} else {
					if (isUndefined( value )) {
						localStorage.removeItem( key );
					} else {
						localStorage.setItem( key, JSON.stringify( value ) );
					}
				}
			},

			toString: function( value ) {
				return (value === null || value === undefined) ? "" : "" + value;
			},

			encodeHtml: function( str ) {
				var div = document.createElement( 'div' );
				div.appendChild( document.createTextNode( str ) );
				return div.innerHTML;
			},

			_referenceTable: referenceTable

		},

		//this is used to process the new node added to repository
		onAddOrUpdateNode: function( fn ) {
			if (fn) {
				onAddOrUpdateHandlers.push( fn );
				return this;
			} else {
				return onAddOrUpdateHandlers;
			}
		},

		onDeleteNode: function( fn ) {
			if (fn) {
				onDeleteHandlers.push( fn );
				return this;
			} else {
				return onDeleteHandlers;
			}
		},

		//use this for configure options
		options: defaultOptions
	} );

	var onDeleteHandlers = [
		function /*removeModelLinksAndShadows*/ ( physicalPath, removedValue ) {

			var watchedPath,
				mainPath,
				physicalPathOfShadow,
				logicalShadowPath,
				logicalPath = toLogicalPath( physicalPath );

			//remove modelLinks whose publisherPath == physicalPath
			for (watchedPath in referenceTable) {
				dereference( physicalPath, watchedPath );
			}

			//remove modelLinks whose subscriber == physicalPath
			for (watchedPath in referenceTable) {
				if (watchedPath.startsWith( physicalPath )) {
					delete referenceTable[watchedPath];
				}
			}

			//delete shadow objects,
			// which are under the direct shadow of main path
			for (mainPath in shadowRoot) {

				physicalPathOfShadow = shadowNamespace + "." + mainPath;
				logicalShadowPath = toLogicalPath( physicalPathOfShadow );

				if (logicalShadowPath == logicalPath ||
				    logicalShadowPath.startsWith( logicalPath + "*" ) ||
				    logicalShadowPath.startsWith( logicalPath + "." )) {
					rootNode.del( physicalPathOfShadow );
				}
			}
		}
	];

	$( "get,set,del,extend".split( "," ) ).each( function( index, value ) {
		hm[value] = function() {
			return rootNode[value].apply( rootNode, slice.call( arguments ) );
		};
	} );

	rootNode = hm();

	$fn.hmData = function( name, value ) {

		var data = this.data( "hmData" );

		if (arguments.length === 0) {

			return data;

		} else if (arguments.length === 1) {

			return data && data[name];

		} else {
			//arguments.length == 2
			if (isUndefined( data )) {
				this.data( "hmData", data = {} );
			}
			data[name] = value;
		}
	};

	/*	pathsWatching: function() {
	 var key, links, rtn = [], path = this.path;
	 for (key in modelLinks) {
	 links = modelLinks[key];
	 if (links.contains( path )) {
	 rtn.push( key );
	 }
	 }
	 return rtn;
	 },

	 ,*/

	//#debug

	hm.debug.referencingPaths = function me( referencedPath, deep ) {
		var rtn = referenceTable[referencedPath] || [];
		if (deep) {
			for (var i = 0; i < rtn.length; i++) {
				rtn.merge( me( rtn[i], deep ) );
			}
		}
		return rtn;
	};

	hm.debug.referencedPath = function( referencingPath ) {
		var key, links, rtn = [];
		for (key in referenceTable) {
			links = referenceTable[key];
			if (links.contains( referencingPath )) {
				rtn.push( key );
			}
		}
		return rtn;
	};

	hm.debug.shadowNamespace = shadowNamespace;
	hm.debug.inferDependencies = inferDependencies;
	hm.debug.removeAll = function() {
		for (var key in repository) {
			if (key !== shadowNamespace) {
				rootNode.del( key, true );
			}
		}
	};
	//#end_debug


//<@depends>model.js</@depends>



	var workflowStore,
		rSpaces = /[ ]+/,
		rEndWithStarDot = /\*\.$/,
		rDotOrStar = /\.|\*/g,
	//rOriginalEvent = /^(.+?)(\.\d+)?$/,
		subscriptionManager,
		viewId = 0,
		rInit = /init(\d*)/,
		workflowType,
	//the handler string should be like
	// "get set convert finalize initialize"
		activityTypes = "get,set,convert,finalize,initialize".split( "," );

	function returnFalse() {
		return false;
	}

	function returnTrue() {
		return true;
	}

	function Event( publisher, originalPublisher, eventType, proposed, removed ) {
		this.publisher = tryWrapPublisherSubscriber( publisher );
		this.originalPublisher = tryWrapPublisherSubscriber( originalPublisher );
		this.type = eventType;
		this.originalType = eventType;
		this.proposed = proposed;
		this.removed = removed;
	}

	Event.prototype = {
		constructor: Event,

		/*	isOriginal: function() {
		 return this.publisher.path == this.originalPublisher.path;
		 },

		 isBubbleUp: function() {
		 return (this.publisher.path != this.originalPublisher.path) &&
		 (this.publisher.path.startsWith( this.originalPublisher.path ));
		 },*/
		isDependent: function() {
			return (!this.publisher.path.startsWith( this.originalPublisher.path ));
		},

		stopPropagation: function() {
			this.isPropagationStopped = returnTrue;
		},

		stopImmediatePropagation: function() {
			this.isImmediatePropagationStopped = returnTrue;
			this.isPropagationStopped = returnTrue;
			this.isCascadeStopped = returnTrue;
		},

		stopCascade: function() {
			this.isCascadeStopped = returnTrue;
		},

		error: function() {
			this.hasError = returnTrue;
		},

		isCascadeStopped: returnFalse,
		isPropagationStopped: returnFalse,
		isImmediatePropagationStopped: returnFalse,
		hasError: returnFalse,
		level: 0
	};

	// raise model event,
	trigger = function( path, originalPath, eventType, proposed, removed ) {

		var e = new Event( path, originalPath, eventType, proposed, removed );

		//event can be changed inside the function
		callbackModelSubscriptionHandler( e );

		if (!e.isPropagationStopped() && e.publisher.path) {

			if (e.isDependent()) {
				//if is dependent event, the original event has been
				// bubbled up in its direct hierarchy
				//we need to change the hierarchy by setting the target
				e.originalPublisher.path = e.publisher.path;
			}

			//continue to the same instance of event object
			do {

				e.publisher.path = e.publisher.pathContext();
				e.level++;
				e.type = e.originalType + "." + e.level;
				callbackModelSubscriptionHandler( e );

			} while (!e.isPropagationStopped() && e.publisher.path);
		}

		//restore previous values
		e.type = eventType;
		e.originalPublisher.path = originalPath;
		e.publisher.path = path;
		return e;
	};


	subscriptionManager = (function() {

		var subscriptionStore = [ ];

		//target is either publisher or subscriber
		function canRemoveSubscriptionData( target, publisher, subscriber ) {
			if (target === publisher || target === subscriber) {
				return true;
			} else {
				//if target is model path
				if (isString( target )) {
					return ( isString( publisher ) && publisher.startsWith( target + "." )) ||
					       ( isString( subscriber ) && subscriber.startsWith( target + "." ));
				} else {
					return false;
				}
			}

		}

		function getSubscriptionsBy( target, match ) {
			if (isString( target )) {
				target = toPhysicalPath( target );
			}

			var rtn = [];
			for (var i = 0, item; i < subscriptionStore.length; i++) {
				item = subscriptionStore[i];
				if (match( item, target )) {
					rtn.push( item );
				}
			}
			return rtn;
		}

		return {

			//subscriptions whose publisher is the parameter
			//publisher can be a model path or dom element, or object
			getByPublisher: function( publisher ) {
				return getSubscriptionsBy( publisher, function( item, target ) {
					return item.publisher == target;
				} );
			},

			//subscriptions whose subscriber is the parameter
			//subscriber can be a model path or dom element, or object
			getBySubscriber: function( subscriber ) {
				return getSubscriptionsBy( subscriber, function( item, target ) {
					return item.subscriber == target;
				} );
			},

			//object can be a model path or dom element, or object
			getBy: function( subscriberOrPublisher ) {
				return getSubscriptionsBy( subscriberOrPublisher, function match( item, target ) {
					return item.subscriber == target || item.publisher == target;
				} );
			},

			getAll: function() {
				return subscriptionStore;
			},

			add: function( subscriber, publisher, eventTypes, workflowInstance ) {
				if (isString( publisher )) {

					var events = eventTypes.split( rSpaces );
					for (var i = 0; i < events.length; i++) {
						var special = this.special[events[i]];
						special && special.setup && special.setup( subscriber, publisher );
					}
				}

				subscriptionStore.push( {
					publisher: publisher,
					subscriber: subscriber,
					eventTypes: eventTypes,
					workflow: workflowInstance
				} );
			},

			removeBy: function( subscriberOrPublisher ) {

				var i,
					j,
					special,
					subscription,
					workflowInstance,
					subscriptionsRemoved = [];

				for (i = subscriptionStore.length - 1; i >= 0; i--) {
					subscription = subscriptionStore[i];
					workflowInstance = subscription.workflow;

					if (canRemoveSubscriptionData( subscriberOrPublisher, subscription.publisher, subscription.subscriber )) {

						//if publisher is an view object, need to unbind or undelegate
						//the jQuery event handler
						if (!isString( subscription.publisher )) {
							if (workflowInstance.delegateSelector) {
								$( subscription.publisher ).undelegate( workflowInstance.delegateSelector, subscription.eventTypes, viewHandlerGateway );

							} else {
								$( subscription.publisher ).unbind( subscription.eventTypes, viewHandlerGateway );
							}
						}

						subscriptionsRemoved.push( subscriptionStore.splice( i, 1 )[0] );
					}
				}

				for (i = subscriptionsRemoved.length - 1; i >= 0; i--) {
					subscription = subscriptionsRemoved[i];
					if (isString( subscription.publisher )) {
						var events = subscription.eventTypes.split( rSpaces );
						for (j = 0; j < events.length; j++) {
							special = this.special[events[j]];
							special && special.teardown && special.teardown( subscription.subscriber, subscription.publisher );
						}
					}
				}
			},

			special: {
				/*validityChanged: {
				 setup: function (publisher, subscriber) {},
				 teardown: function (publisher, subscriber) {}
				 }
				 */
			}

		};
	})();

	function getMember( e ) {

		var workflowInstance = e.workflow,
			propertyName = workflowInstance.getName,
		//getSubProperty is used for properties like css, attr, prop
			subPropertyName = workflowInstance.getParas,
			publisher = e.publisher;

		return subPropertyName ? publisher[propertyName]( subPropertyName ) :
			isFunction( publisher[propertyName] ) ? publisher[propertyName]() :
				publisher[propertyName];
	}

	function setMember( value, e ) {
		var workflowInstance = e.workflow,
			propertyName = workflowInstance.setName,
		//setSubProperty is used for properties like css, attr, prop
			subPropertyName = workflowInstance.setParas,
			subscriber = this;

		subPropertyName ? subscriber[propertyName]( subPropertyName, value ) :
			isFunction( subscriber[propertyName] ) ? subscriber[propertyName]( value ) :
				subscriber[propertyName] = value;
	}

	extend( hm, {

		//Event: Event,

		trigger: trigger,

		subscription: subscriptionManager,

		//handler can be a function (e) {}
		// a string like "get set convert int"
		//or "*get *set *convert *int"
		//or it can be "*commonHandler"
		//or it can be { get:xx, set:xx, convert:xx, initialize: xx}
		//it can be a javascript object, dom element, but it can not be a jQuery object
		//subscriber can be null, "_", "null", undefined to represent a case where there is not subscriber
		//if subscriber is "", it means the the root model, the repository object
		sub: function( subscriber, publisher, eventTypes, workflow, workflowOptions, delegateSelector ) {

			if (subscriber instanceof hm) {
				subscriber = subscriber.path;
			}

			if (publisher instanceof hm) {
				publisher = publisher.path;
			}

			if (isString( subscriber ) && subscriber.startsWith( "$" )) {
				subscriber = $( subscriber.substr( 1 ) );
			}

			if (subscriber && subscriber.jquery) {
				//subscriber is like $()
				//need to convert jQuery object into dom or raw element
				if (!subscriber.length && !subscriber.selector) {
					subscriber = null;
				} else {
					subscriber.each( function( index, element ) {
						//unwrap jQuery element
						hm.sub( element, publisher, eventTypes, workflow, workflowOptions, delegateSelector );
					} );
					return;
				}
			}

			if (isString( publisher ) && publisher.startsWith( "$" )) {
				publisher = $( publisher.substr( 1 ) );
			}

			if (publisher && publisher.jquery) {
				publisher.each( function( index, element ) {
					hm.sub( subscriber, element, eventTypes, workflow, workflowOptions, delegateSelector );
				} );
				return;
			}

			if (!publisher && publisher !== "") {
				throw "publisher can not be null";
			}

			if (!eventTypes) {
				throw "eventTypes can not be null";
			}

			//allow subscriber "", because this is the path of root model
			if (subscriber === "_" || subscriber == "null" || subscriber === null) {
				subscriber = undefined;
			}

			if (workflowOptions === "_") {
				workflowOptions = undefined;
			}

			var isPublisherModel = isString( publisher ),
				isSubscriberModel = isString( subscriber );

			viewIdManager.mark( publisher );
			viewIdManager.mark( subscriber );

			if (isPublisherModel) {
				//subscriber is a model
				publisher = toPhysicalPath( publisher );
			}

			if (isSubscriberModel) {
				//subscriber is a model
				subscriber = toPhysicalPath( subscriber );

			}

			if (isPublisherModel) {

				subscribeModelEvent( publisher, eventTypes, subscriber, workflow, workflowOptions );

			} else {

				subscribeViewEvent( publisher, eventTypes, subscriber, workflow, workflowOptions, delegateSelector );
			}
		},

		handle: function( /* publisher, eventTypes, workflow, workflowOptions, delegateSelector */ ) {
			return this.sub.apply( this, [null].concat( slice.call( arguments ) ) );
		},

		//a workflowPrototype can be a string like "get set convert initialize finalize"
		// or it can be an object
		/*
		 {
		 get: "xx" or function () {},
		 set: "xx" or function () {},
		 convert: "xx" or function () {},
		 initialize: "xx" or function () {},
		 finalize: "xx" or function () {}
		 }
		 */
		workflowType: workflowType = function( name, workflowPrototype ) {

			if (isObject( name )) {
				for (var key in name) {
					workflowStore[key] = buildWorkflowType( name[key] );
				}
				return;
			}

			if (isUndefined( name )) {
				return workflowStore;
			}

			if (isUndefined( workflowPrototype )) {
				return workflowStore[name];
			}

			workflowStore[name] = buildWorkflowType( workflowPrototype );
			return workflowStore[name];

		},
		//common getter and setter are special activity in they way they are used
		//other activities use the key directly to reference the activities
		// but getters and setters need to use "*key" to reference getters and setters
		// if your getter/setter key does not begin with "*", then it will use the defaultGet
		//or defaultSet, and they key will become the getProperty, and optionally,
		// use options to pass the getProp value, the defaultGet/defaultSet
		// are not meant to be used directly like other common getters or setters
		activity: {

			//initialize( publisher, subscriber, workflowInstance, workflowOptions );
			//inside initialize function, 'this' refer to the window
			initialize: {},

			//value = workflowInstance.get.apply( subscriber, [e].concat( triggerData ) );
			//inside the getter function, 'this' refer to the subscriber
			//get(e)
			get: {
				getMember: getMember,

				//the original get is "get" current
				//because of event bubbling, the default get method for model
				//will not return the value you want, so need to getOriginal
				getOriginal: function( e ) {
					return e.originalPublisher.get();
				},

				fakeGet: function() {
					return dummy;
				}
			},

			//workflowInstance.set.call( subscriber, value, e );
			//inside setter function 'this' refer to the subscriber
			//set(value, e)
			set: {
				setMember: setMember,
				fakeSet: $.noop

			},

			//workflowInstance.convert.call( subscriber, value, e );
			//inside converter function 'this' refer to subscriber
			convert: {

				toString: util.toString,

				toTypedValue: util.toTypedValue,

				toNumber: function( value ) {
					return +value;
				},

				toDate: function( value ) {
					return new Date( value );
				}


			},

			//workflowInstance.finalize.call( subscriber, value, e );
			//inside the afterSet function, 'this' refer to the subscriber
			finalize: {
				//				saveLocal: function( value, e ) {
				//					util.local( e.publisher.path, value );
				//				}
			}
		}
	} );

	workflowStore = {

		triggerChange: {
			get: function( e ) {
				rootNode.triggerChange( e.workflow.options );
			}
		},
		saveLocal: {
			get: function( e ) {
				var path = e.publisher.path;
				setTimeout( function() {
					hm( path ).saveLocal();
				}, 1 );
			}
		}
	};

	var viewIdManager = {

		getId: function( elem ) {
			return $( elem ).hmData( "viewId" );
		},

		unMark: function( elem ) {
			$( elem ).hmData( "viewId", undefined );
		},

		mark: function( elem ) {
			if (isObject( elem ) && !$( elem ).hmData( "viewId" )) {
				$( elem ).hmData( "viewId", ++viewId );
			}
		}
	};

	// -------- private ------------- //
	//the reason that we want to buildUniqueViewEventTypes is that
	//when unbind or undelegate the viewEventTypes, we want to the viewEventTypes
	//as unique as possible, check the unsubscribe method
	//
	//input: getUniqueViewEventTypes("click dblClick", viewWithViewId3, "customer")
	//output: "click.__hm.3.customer dblClick.__hm.3.customer"
	//input: getUniqueViewEventTypes("click dblClick", viewWithViewId3, viewWithViewId4)
	//output: "click.__hm.3.4 dblClick.__hm.3.4"
	//it try to append an event name with and ".__hm.viewId.subscriberId"
	function buildUniqueViewEventTypes( originalEventTypes, publisherView, subscriber ) {

		var publisherViewId = viewIdManager.getId( publisherView );

		/*	if original viewEvents is "click dblClick",
		 and it bind to path "firstName", it will convert to
		 click.__hm.firstName dblClick.__hm.firstName, the reason is that
		 when path is deleted, the method unbind(object) need to unbind
		 event by a namespace, if firstName is deleted, we can unbind ".__hm.firstName"*/
		return $.map(
			originalEventTypes.split( rSpaces ),
			function( originalEventName ) {
				return isString( subscriber ) ?
					originalEventName + "." + shadowNamespace + "." + publisherViewId + "." + subscriber :
					originalEventName + "." + shadowNamespace + "." + publisherViewId + "." + viewIdManager.getId( subscriber );
			}
		).join( " " );
	}

	//if object is dom element or jQuery selector then wrap into jQuery
	//if object is model path, wrap it into model
	//if it is pure object, return as it is
	//if it is _, return null
	function tryWrapPublisherSubscriber( publisherOrSubscriber ) {
		if (isString( publisherOrSubscriber )) {
			return hm( publisherOrSubscriber );

		} else if (isObject( publisherOrSubscriber ) && !publisherOrSubscriber.nodeType) {
			//not a DOM element
			return publisherOrSubscriber;

		} else if (!isUndefined( publisherOrSubscriber )) {

			return $( publisherOrSubscriber );
		}
	}

	function replaceDotOrStar( match ) {
		//if match is ".", normalize it to "\\."
		//if match is "*", normalize it to ".*"
		return match == "." ? "\\." : ".*";
	}

	//if one of the subscribed events is matched with triggering event
	//return that subscribed event
	function getMatchedSubscribedEvent( subscribedEvents, triggeringEvent ) {

		var match,
			source,
			rMatchWithTriggeringEvent,
			eventSubscribed,
			isEndWithStarDot,
			i;

		if (subscribedEvents === "*") {
			return "*";
		}

		subscribedEvents = subscribedEvents.split( rSpaces );

		for (i = 0; i < subscribedEvents.length; i++) {

			eventSubscribed = subscribedEvents[i];

			isEndWithStarDot = rEndWithStarDot.test( eventSubscribed );

			source = isEndWithStarDot ?
				//if eventSubscribed is like "*." or "before*.";
				eventSubscribed.replace( rEndWithStarDot, "" ) :
				eventSubscribed;

			source = source.replace( rDotOrStar, replaceDotOrStar );

			source = isEndWithStarDot ? "^" + source : "^" + source + "$";

			rMatchWithTriggeringEvent = new RegExp( source );

			match = rMatchWithTriggeringEvent.test( triggeringEvent );

			if (match) {
				if (isEndWithStarDot) {
					//in other browser, in the following is enough
					//var remaining = RegExp.rightContext;
					//
					//however in IE has a bug that, if rTemp is /^/, RegExp.rightContext return ""
					//while other browser RegExp.rightContext return the remaining
					//see http://jsbin.com/ikakuw/2/edit
					var remaining = source == "^" ? triggeringEvent : RegExp.rightContext;

					//if remaining is empty or remaining does not contains "."
					if (!remaining || !remaining.contains( "." )) {
						return subscribedEvents[i];
					}
				} else {
					return subscribedEvents[i];
				}
			}
		}
	}

	//check if subscription matched with the triggering event,
	// and invoke its workflow, and also cascade the events to
	//horizontally, e is mutable
	function callbackModelSubscriptionHandler( e ) {

		var subscription,
			referencingNodes,
			cascadeEvent,
			i,
			j,
			subscriptionsByPublisher = e.publisher.subsToMe();

		for (i = 0; i < subscriptionsByPublisher.length; i++) {

			subscription = subscriptionsByPublisher[i];

			e.matchedType = getMatchedSubscribedEvent( subscription.eventTypes, e.type );

			if (e.matchedType) {
				executeWorkflowInstance( tryWrapPublisherSubscriber( subscription.subscriber ), subscription.workflow, e );
			}

			if (e.isImmediatePropagationStopped()) {
				return;
			}
		}

		if (!e.isCascadeStopped()) {

			referencingNodes = referenceTable[e.publisher.path];

			if (referencingNodes) {
				for (j = 0; j < referencingNodes.length; j++) {

					cascadeEvent = trigger(
						referencingNodes[j],
						e.originalPublisher.path,
						e.type
					);

					if (cascadeEvent.isImmediatePropagationStopped() || cascadeEvent.isImmediatePropagationStopped()) {
						return;
					}

					if (cascadeEvent.hasError()) {
						e.error();
					}
				}
			}
		}
	}

	//#debug

	if (location.search.contains( "debug" )) {
		defaultOptions.debug = true;
	}

	function unwrapObject( object ) {
		if (object) {
			if (!isUndefined( object.path )) {
				return hm.util.toLogicalPath( object.path );
			} else {
				return object[0];
			}
		} else {
			return "null"
		}
	}

	//#end_debug

	function executeWorkflowInstance( subscriber, workflowInstance, e, triggerData ) {

		//#debug
		if (defaultOptions.debug) {
			log( unwrapObject( e.publisher ),
				e.type,
				unwrapObject( subscriber ),
				workflowInstance,
				unwrapObject( e.originalPublisher )
			);
		}
		//#end_debug

		var value,
			clonedEventArg;

		e.workflow = workflowInstance;
		e.subscriber = subscriber;

		if (!isUndefined( triggerData )) {
			//in the get method "this" refer to the handler
			value = workflowInstance.get.apply( subscriber, [e].concat( triggerData ) );
		} else {
			//in the get method "this" refer to the handler
			value = workflowInstance.get.call( subscriber, e );
		}

		if (isPromise( value )) {
			clonedEventArg = extend( true, {}, e );
			value.done( function( value ) {
				if (workflowInstance.convert) {
					//in the convert method "this" refer to the handler
					value = workflowInstance.convert.call( subscriber, value, e );
				}

				if (!isUndefined( value )) {
					//make sure it is a real promise object
					if (isPromise( value )) {
						value.done( function( value ) {
							setAndFinalize( subscriber, workflowInstance, value, clonedEventArg );
						} );

					} else {
						return setAndFinalize( subscriber, workflowInstance, value, e );
					}
				}
			} );
		} else {
			if (workflowInstance.convert) {
				//in the convert method "this" refer to the handler
				value = workflowInstance.convert.call( subscriber, value, e );
			}

			if (!isUndefined( value )) {
				//make sure it is a real promise object
				if (isPromise( value )) {
					clonedEventArg = extend( true, {}, e );
					value.done( function( value ) {
						setAndFinalize( subscriber, workflowInstance, value, clonedEventArg );
					} );

				} else {
					setAndFinalize( subscriber, workflowInstance, value, e );
				}
			}
		}

	}

	function setAndFinalize( subscriber, workflowInstance, value, e ) {
		if (!isUndefined( value )) {
			if (value === dummy) {
				value = undefined;
			}
			workflowInstance.set && workflowInstance.set.call( subscriber, value, e );
			workflowInstance.finalize && workflowInstance.finalize.call( subscriber, value, e );
		}
	}

	function subscribeModelEvent( publisherPath, eventTypes, subscriber, handler, options ) {

		var match,
			delayMiniSecond,
			initEvent,
			workflowInstance,
			events;

		events = eventTypes.split( " " );

		for (var i = 0; i < events.length; i++) {
			match = rInit.exec( events[i] );
			if (match) {
				initEvent = events[i];
				delayMiniSecond = +match[1];
				events.splice( i, 1 );
				eventTypes = events.join( " " );
				break;
			}
		}

		workflowInstance = buildWorkflowInstance( handler, publisherPath, subscriber, options );

		if (eventTypes) {
			subscriptionManager.add( subscriber, publisherPath, eventTypes, workflowInstance );
		}

		if (initEvent) {
			var init = function() {
				var e = new Event( publisherPath, publisherPath, initEvent );
				executeWorkflowInstance( tryWrapPublisherSubscriber( subscriber ), workflowInstance, e );
			};

			if (delayMiniSecond) {
				setTimeout( init, delayMiniSecond );
			} else {
				init();
			}
		}
	}

	//subscribe jQuery event
	function subscribeViewEvent( viewPublisher, eventTypes, subscriber, handler, options, delegateSelector ) {

		//get/set/convert/[init]/[options]
		var needInit,
			eventSeedData,
			workflowInstance,
			temp;

		temp = eventTypes.split( " " );

		if (temp.contains( "init" )) {
			needInit = true;
			eventTypes = temp.remove( "init" ).join( " " );
		}

		workflowInstance = buildWorkflowInstance( handler, viewPublisher, subscriber, options );

		eventSeedData = {
			workflow: workflowInstance,
			subscriber: subscriber
		};

		if (eventTypes) {
			eventTypes = buildUniqueViewEventTypes( eventTypes, viewPublisher, subscriber );

			if (delegateSelector) {
				workflowInstance.delegateSelector = delegateSelector;
				$( viewPublisher ).delegate( delegateSelector, eventTypes, eventSeedData, viewHandlerGateway );

			} else {
				$( viewPublisher ).bind( eventTypes, eventSeedData, viewHandlerGateway );

			}

			//we have passed handler, subscriber, options as jQuery eventSeedData,
			//we still need to add them to subscriptions so that
			//the view event handler can be unbind or undelegate
			subscriptionManager.add( subscriber, viewPublisher, eventTypes, workflowInstance );

			if (needInit) {
				if (delegateSelector) {
					$( viewPublisher ).find( delegateSelector ).trigger( eventTypes );
				} else {
					$( viewPublisher ).trigger( eventTypes );
				}
			}

		} else if (needInit) {

			$( viewPublisher ).one( "init", eventSeedData, viewHandlerGateway );
			$( viewPublisher ).trigger( "init" );

		}
	}

	//the general jQuery event handler
	function viewHandlerGateway( e ) {

		e.publisher = tryWrapPublisherSubscriber( e.currentTarget );
		e.originalPublisher = tryWrapPublisherSubscriber( e.target );
		var subscriber = tryWrapPublisherSubscriber( e.data.subscriber );

		var workflowInstance = e.data.workflow;
		delete e.data;

		if (arguments.length > 1) {
			executeWorkflowInstance( subscriber, workflowInstance, e, slice.call( arguments, 1 ) );

		} else {
			executeWorkflowInstance( subscriber, workflowInstance, e );
		}
	}

	function buildWorkflowInstance( workflowPrototype, publisher, subscriber, initializeOptions ) {

		var workflowInstance;

		workflowPrototype = workflowPrototype || "";

		if (isString( workflowPrototype )) {

			workflowInstance = buildWorkflowInstanceFromString( workflowPrototype, publisher, subscriber, initializeOptions );

		} else if (isFunction( workflowPrototype )) {

			workflowInstance = extend( {
					get: workflowPrototype,
					options: initializeOptions
				},
				workflowPrototype
			);

		} else if (isObject( workflowPrototype ) && workflowPrototype.get) {

			workflowInstance = extend( {
				options: initializeOptions
			}, workflowPrototype );

		} else {
			throw "invalid workflow expression";
		}

		initializeWorkflowInstance( workflowInstance, publisher, subscriber, initializeOptions );

		convertStringAccessorToFunction( "get", workflowInstance, publisher, subscriber );
		convertStringAccessorToFunction( "set", workflowInstance, publisher, subscriber );
		//
		convertStringActivityToFunction( workflowInstance, "convert" );
		convertStringActivityToFunction( workflowInstance, "finalize" );

		return workflowInstance;
	}

	// workflowString is like "*workflowType" or "get set convert finalize initialize"
	function buildWorkflowInstanceFromString( workflowString, publisher, subscriber, initializeOptions ) {

		//get set convert initialize finalize
		var workflowInstance,
			embeddedHandler,
			activityName,
			activityNames = workflowString.split( rSpaces ),
			activityType;

		if (activityNames.length == 1) {

			if (workflowString.startsWith( "*" )) {

				workflowInstance = workflowStore[workflowString.substr( 1 )];
				if (!workflowInstance) {
					throw "common workflow " + workflowString + " does not exist";
				}

				workflowInstance = extend( {}, workflowInstance );

			} else if ((embeddedHandler = tryGetEmbeddedHandler( workflowString, publisher, subscriber ))) {

				if (isFunction( embeddedHandler )) {
					workflowInstance = extend( {
						get: embeddedHandler,
						options: initializeOptions
					}, embeddedHandler );
				} else if (isObject( embeddedHandler ) && embeddedHandler.get) {
					workflowInstance = extend( {
						options: initializeOptions
					}, embeddedHandler );
				} else {
					throw "missing handler";
				}

			} else if (!isUndefined( publisher ) && !isUndefined( subscriber )) {

				workflowInstance = inferWorkflowInstanceFromSingleActivity(
					publisher,
					subscriber,
					workflowString );

			} else {
				//either model is empty or view is empty,
				// and the workflow string is a single
				//key, and the key is not workflow type
				throw "invalid handler";
			}

		} else {
			//this is the case
			//activityNames.length > 1

			workflowInstance = { };

			for (var i = 0; i < activityTypes.length; i++) {
				activityName = activityNames[i];
				activityType = activityTypes[i];

				if (activityName && (activityName !== "_" && activityName != "null")) {
					workflowInstance[activityType] = activityName;
				}
			}
		}
		return workflowInstance;
	}

	//get embedded handler helper by path
	//the path should be a path prefix with "#"
	//that path can be absolute path like "#/a.b"
	//or it can be relative path relative to subscriber model or publisher model
	function tryGetEmbeddedHandler( path, publisher, subscriber ) {

		if (path.startsWith( "#" )) {

			var modelPath = path.substr( 1 );

			modelPath = isString( subscriber ) ? mergePath( subscriber, modelPath ) :
				isString( publisher ) ? mergePath( publisher, modelPath ) :
					modelPath;

			return rootNode.raw( modelPath );
		}
	}

	function initializeWorkflowInstance( workflowInstance, publisher, subscriber, workflowOptions ) {

		var initialize = workflowInstance.initialize;

		if (isString( initialize )) {
			if (initialize.startsWith( "*" )) {
				initialize = hm.activity.initialize[initialize.substring( 1 )];
				if (!initialize) {
					throw "initialize activity does not exist!";
				}
			} else {
				var path = initialize;
				if (!rootNode.raw( path )) {
					throw "initialize activity does not exist at path " + path;
				}
				initialize = function( publisher, subscriber, workflowInstance, options ) {
					rootNode.set( path, publisher, subscriber, workflowInstance, options );
				};
			}
		}

		if (initialize) {
			initialize( tryWrapPublisherSubscriber( publisher ), tryWrapPublisherSubscriber( subscriber ), workflowInstance, workflowOptions );
		} else if (!isUndefined( workflowOptions )) {
			workflowInstance.options = workflowOptions;
		}
	}

	function inferWorkflowInstanceFromSingleActivity( publisher, subscriber, activityName ) {
		//now workflowString does not startsWith *, it is not a workflow type
		//infer handler from publisher and subscriber
		//
		var workflowInstance,
			isPublisherModel = isString( publisher ),
			isSubscriberModel = isString( subscriber );

		if (isPublisherModel) {
			//if publisher is model, then the logic is
			//will get model's value using default get activity,
			//and update the view using workflow or  default "set" activity
			//
			workflowInstance = {

				get: "get",

				//if workflowString is not empty, it is the set method, for example
				//$("#lable").sub(hm("message"), "text");
				//
				//if workflowString is empty,
				// then it should be the case when model subscribe model
				//copy value of one node to an other node
				//hm("message").sub(hm("name"), "afterUpdate");
				set: activityName || "set"


			};

		} else if (isSubscriberModel) {

			// model subscribe view event

			if (activityName) {
				//hm("name").sub($("#textBox", "change");
				workflowInstance = {
					get: activityName,
					set: "set"
				};
			} else {

				//if workflowString is empty
				//when model subscribe view without handler
				//the model is the handler by itself
				//e.g
				//hm("functionNode").subscribe($("button"), "click");
				var temp = rootNode.raw( subscriber );
				if (isFunction( temp )) {

					workflowInstance = {
						get: rootNode.raw( subscriber )
					};

				} else if (isObject( temp ) && temp.get) {

					workflowInstance = temp;

				} else {
					throw "missing handler";
				}
			}

		} else {
			//view subscribe view's event
			//this is rarely the case, but it is still supported
			//for example, a label subscribe the change of another label
			//$("#lable2").sub("#lable1", "text");
			workflowInstance = {
				get: activityName,
				set: activityName
			};
		}

		return workflowInstance;
	}

	function buildWorkflowType( workflowPrototype ) {

		var workflowInstance;

		if (isString( workflowPrototype )) {

			workflowInstance = buildWorkflowTypeFromString( workflowPrototype );

		} else if (isFunction( workflowPrototype ) || (isObject( workflowPrototype ) && workflowPrototype.get)) {

			workflowInstance = workflowPrototype;
			if (isFunction( workflowPrototype )) {

				workflowInstance = extend(
					{
						get: workflowPrototype
					},
					workflowInstance );
			}

		} else {
			throw "invalid workflow expression";
		}

		convertStringActivityToFunction( workflowInstance, "initialize" );
		//
		convertStringAccessorToFunction( "get", workflowInstance );
		convertStringAccessorToFunction( "set", workflowInstance );
		//
		convertStringActivityToFunction( workflowInstance, "convert" );
		convertStringActivityToFunction( workflowInstance, "finalize" );

		return workflowInstance;
	}

	function buildWorkflowTypeFromString( workflowString ) {

		var workflowInstance,
			activityName,
			activityNames = workflowString.split( rSpaces ),
			activityType;

		if (activityNames.length > 1) {

			workflowInstance = { };

			for (var i = 0; i < activityTypes.length; i++) {
				activityName = activityNames[i];
				activityType = activityTypes[i];

				if (activityName && (activityName !== "_" && activityName != "null")) {
					workflowInstance[activityType] = activityName;
				}
			}
		} else {
			throw "invalid workflow type";
		}

		return workflowInstance;
	}

	function getActivitySet( activityType ) {
		return hm.activity[activityType];
	}

	// publisher, subscriber is optional
	function convertStringAccessorToFunction( accessorType, workflowInstance, publisher, subscriber ) {

		//by default workflow.get == "get", workflow.set = "set"
		var accessorKey = workflowInstance[accessorType];

		if (accessorKey && isString( accessorKey )) {

			var accessors = getActivitySet( accessorType );

			if (accessorKey.startsWith( "*" )) {

				accessorKey = accessorKey.substr( 1 );
				workflowInstance[accessorType] = accessors[accessorKey];

				if (!workflowInstance[accessorType]) {
					throw accessorKey + " does not exists " + accessorType + " Activity";
				}

			} else {

				var keys = accessorKey.split( "*" );

				//use defaultGet or defaultSet and decorate, if accessorKey does not begin with "*"
				// handler.setProperty = accessorKey or
				// handler.getProperty = accessorKey
				workflowInstance[accessorType] = accessorType == "get" ? getMember : setMember;
				workflowInstance[accessorType + "Name"] = keys[0];

				if (keys[1]) {
					//accessorKey = "css*color"
					workflowInstance[accessorType + "Paras"] = keys[1];
				}

				if (!isUndefined( publisher ) && !isUndefined( subscriber )) {
					var publisherOrSubscriber = accessorType == "get" ? publisher : subscriber;
					ensureTargetHasAccessor( accessorType, keys[0], publisherOrSubscriber );
				}
			}
		}
	}

	function ensureTargetHasAccessor( accessorType, activityName, target ) {
		var missingMember;
		if (isString( target )) {

			if (!hmFn[activityName]) {

				missingMember = true;
			}

		} else {
			if (target.nodeType) {
				if (!$fn[activityName]) {
					missingMember = true;
				}
			} else if (!(activityName in target)) {
				missingMember = true;
			}
		}

		if (missingMember) {
			throw (accessorType == "get" ? "publisher" : "subscriber") +
			      " does not have a member " + activityName;
		}
	}

	//activityType is like initialize, convert, finalize
	function convertStringActivityToFunction( workflowInstance, activityType ) {
		//because it is optional, we need make sure handler want to have this method
		var activityName = workflowInstance[activityType];
		if (isString( activityName )) {

			if (activityName.startsWith( "*" )) {
				workflowInstance[activityType] = getActivitySet( activityType )[activityName.substr( 1 )];
				if (!workflowInstance[activityType]) {
					throw  activityName + "Activity does not exists";
				}

			} else {
				workflowInstance[activityType] = function() {
					return rootNode.raw( activityName ).apply( this, arguments );
				};
			}
		}
	}

	function unsubscribe( target ) {
		if (isObject( target )) {
			if (!viewIdManager.getId( target )) {
				return;
			}
			viewIdManager.unMark( target );
		}
		subscriptionManager.removeBy( target );
	}

	hm.onDeleteNode( unsubscribe );

	//subscription shortcut method for model
	extend( hmFn, {

		trigger: function( subPath, eventName, proposed, removed ) {

			if (!arguments.length) {
				throw "missing arguments";
			}

			if (arguments.length <= 3) {
				removed = proposed;
				proposed = eventName;
				eventName = subPath;
				subPath = "";
			}

			var physicalPath = this.physicalPath( subPath );
			trigger( physicalPath, physicalPath, eventName, proposed, removed );
			return this;
		},

		triggerChange: function( subPath ) {
			var physicalPath = this.physicalPath( subPath ),
				value = this.get( subPath );
			trigger( physicalPath, physicalPath, "afterUpdate", value, value );
			return this;
		},

		sub: function( publisher, events, handler, options, delegateSelector ) {
			hm.sub( this.path, publisher, events, handler, options, delegateSelector );
			return this;
		},

		handle: function( eventTypes, workflow, workflowOptions, delegate ) {
			hm.sub( null, this, eventTypes, workflow, workflowOptions, delegate );
			return this;
		},

		subBy: function( subscriber, events, handler, options, delegateSelector ) {
			hm.sub( subscriber, this.path, events, handler, options, delegateSelector );
			return this;
		},

		subsToMe: function( print ) {
			var rtn = subscriptionManager.getByPublisher( this.path );
			//#debug
			if (print && hm.printSubscriptions) {
				hm.printSubscriptions( this.path, rtn, "toMe" );
			}
			//#end_debug

			return rtn;
		},

		subsFromMe: function( print ) {
			var rtn = subscriptionManager.getBySubscriber( this.path );
			//#debug
			if (print && hm.printSubscriptions) {
				hm.printSubscriptions( this.path, rtn, "fromMe" );
			}
			//#end_debug

			return rtn;
		},

		subs: function( print ) {
			var rtn = subscriptionManager.getBy( this.path );

			//#debug
			if (print && hm.printSubscriptions) {
				hm.printSubscriptions( this.path, rtn );
			}
			//#end_debug

			return rtn;
		},

		/*
		 map an model event to a new model event based on a condition, like the following

		 hm("inventory").mapEvent(
		 "afterUpdate",
		 "inventoryLow",
		 function (value) {
		 return value <= 100;
		 }
		 );

		 condition is optional, if it is missing, the target event will always be triggered
		 when the source event is triggered
		 */
		mapEvent: function( sourceEvent, targetEvent, condition ) {
			condition = condition || returnTrue;
			hm.handle( this.path, sourceEvent, function( e ) {
				if (condition.call( this, e )) {
					e.publisher.trigger( targetEvent, e.proposed, e.removed );
				}
			} );
			return this;
		},

		cacheable: function( subPath ) {
			hm.handle( this.getPath( subPath ), "init after*", "*saveLocal" );
			return this;
		}

	} );

	//subscription shortcut method for jQuery object
	extend( $fn, {

		sub: function( publisher, events, handler, options, delegate ) {
			if (this.length) {
				hm.sub( this, publisher, events, handler, options, delegate );
			}
			return this;
		},

		handle: function( eventTypes, workflow, workflowOptions, delegate ) {
			if (this.length) {
				hm.sub( null, this, eventTypes, workflow, workflowOptions, delegate );
			}
			return this;
		},

		subBy: function( subscriber, events, handler, options, delegate ) {
			if (this.length) {
				hm.sub( subscriber, this, events, handler, options, delegate );
			}
			return this;
		},

		subsToMe: function( print ) {
			var rtn = subscriptionManager.getByPublisher( this[0] );

			//#debug
			if (print && hm.printSubscriptions) {
				hm.printSubscriptions( this[0], rtn, "toMe" );
			}
			//#end_debug

			return rtn;
		},

		subsFromMe: function(print) {
			var rtn = subscriptionManager.getBySubscriber( this[0] );

			//#debug
			if (print && hm.printSubscriptions) {
				hm.printSubscriptions( this[0], rtn, "fromMe" );
			}
			//#end_debug

			return rtn;
		},

		subs: function( print ) {
			var rtn = subscriptionManager.getBy( this[0] );

			//#debug
			if (print && hm.printSubscriptions) {
				hm.printSubscriptions( this[0], rtn );
			}
			//#end_debug

			return rtn;
		},

		initView: function( path, workflow, options ) {
			hm.sub( this, path, "init", workflow, options );
			return this;
		},

		/*
		 map a view event to a new view event based on a condition, condition is optional,
		 if it is missing, the target event will always be triggered when the source
		 event is triggered

		 usage
		 $("button").mapEvent("click", "update");
		 */
		mapEvent: function( sourceEvent, targetEvent, condition, eventData ) {
			if (condition) {
				if (!isFunction( condition )) {
					eventData = condition;
					condition = returnTrue;
				}
			} else {
				condition = returnTrue;
			}

			return this.handle( sourceEvent, function( e ) {
				if (condition.call( this, e )) {
					e.type = targetEvent;
					e.eventData = eventData;
					e.publisher.trigger( e );
				}
			} );
		}
	} );

	// create a special jQuery event (y) based on an existing jQuery event (x)
	// when event x is raised, and condition returns true, event y will be raised
	//
	// you can subscribe event y, just like any other jQuery event using
	//$("button").bind("y", fn);
	//
	//unlike $().mapEvent("click", "y"), this method create a new event type for all
	//jQuery object
	hm.newViewEvent = function( event, baseEvent, condition ) {
		if (isObject( event )) {
			for (var key in event) {
				hm.newViewEvent( key, event[key][0], event[key][1] );
			}
			return this;
		}
		var handler = function( e ) {
			if (condition === true || condition.call( this, e )) {
				$( e.target ).trigger( extend( {}, e, {
					type: event,
					currentTarget: e.target
				} ) );
			}
		};

		if ($.event.special[event]) {
			throw "event '" + event + "' has been defined";
		}

		$.event.special[event] = {
			setup: function() {
				$( this ).bind( baseEvent, handler );
			},
			teardown: function() {
				$( this ).unbind( baseEvent, handler );
			}
		};
		return this;
	};

	var _cleanDataForUnsubscribe = $.cleanData;
	//when an dom element is remove unsubscribe it first
	$.cleanData = function( elems ) {
		$( elems ).each( function() {
			unsubscribe( this );
		} );
		_cleanDataForUnsubscribe( elems );
	};

	util.getUniqueViewEventTypes = buildUniqueViewEventTypes;
	util._viewHandlerGateway = viewHandlerGateway;

	//#debug
	hm.debug.getMatchedSubscribedEvent = getMatchedSubscribedEvent;
	hm.debug.buildWorkflowType = buildWorkflowType;
	hm.debug.getMember = getMember;
	hm.debug.setMember = setMember;
	hm.debug.unsub = function( object ) {
		unsubscribe( object );
	};
	//#end_debug


//
//<@depends>subscription.js, model.js</@depends>


	var rSubscriptionProperty = /([!$]?)([\w \+\-\*\.]+?):([\w\W]+?)\s*(?:[;]\s*|$)/g,
		rBehaviorText = /^([^|]+)(\|(.*))?$/,
		rSubscriptionValueSeparator = /\s*\|\s*/g;

	defaultOptions.subsAttr = "data-sub";
	defaultOptions.autoparseSub = true;

	function mergeOptions( parentOptions, localOptions ) {
		if (localOptions !== "_") {
			return  (localOptions && localOptions.startsWith( "_" )) ?
				localOptions.substr( 1 ) :
				parentOptions || localOptions;
		}
	}

	function getInheritedNamespace( elem ) {

		var $parent = $( elem );

		while (($parent = $parent.parent()) && $parent.length) {

			var ns = $parent.hmData( "ns" );

			if (!isUndefined( ns )) {
				return ns;
			}
		}
		return "";
	}

	var reHyphen = /-/g;
	var reAttr = /-(\w)/g;

	var replaceAttr = function( match, $1 ) {
		return $1.toUpperCase();
	};

	//convert add-class to addClass
	//convert $enter-blur to $enter blur
	function normalizeAttributeName( attributeName ) {
		return attributeName.startsWith( "!" ) || attributeName.startsWith( "$" ) ?
			attributeName.replace( reHyphen, " " ) :
			attributeName.replace( reAttr, replaceAttr );
	}

	function extractSubscriptionText( elem ) {
		if (elem.nodeType !== 1) {
			return;
		}
		var i, attr, attributeName, attributes = elem.attributes,
			subscriptionText = attributes[defaultOptions.subsAttr] && attributes[defaultOptions.subsAttr].nodeValue || "";

		for (i = 0; i < attributes.length; i++) {
			attr = attributes[i];
			attributeName = normalizeAttributeName( attr.name );

			if (attributeName == "ns" || hm.behavior[attributeName] || attributeName.startsWith( "!" ) || attributeName.startsWith( "$" )) {
				subscriptionText = attributeName + ":" + (attr.nodeValue || "/") + ";" + subscriptionText;
			}
		}
		return subscriptionText;
	}

	//support
	//new Behavior()
	//new Behavior(subscriptionText, parentBehavior)
	//new Behavior("$click|*alert;val:path", parentBehavior);
	function Behavior( subscriptionText, parentBehavior, behaviorNs, behaviorOptions ) {

		var nsProperty, match, emptyBehavior;

		//new Behavior()
		if (!subscriptionText) {
			//
			//shared property
			this.subscriptions = [];
			return;
		}

		//new Behavior (elem);
		if (subscriptionText.nodeType) {
			var elem = subscriptionText;
			subscriptionText = parentBehavior || extractSubscriptionText( elem );
			if (subscriptionText) {
				emptyBehavior = new Behavior();
				emptyBehavior.elem = elem;
				emptyBehavior.ns = getInheritedNamespace( elem );
				return new Behavior( subscriptionText, emptyBehavior );
			}
			return;
		}

		if (!parentBehavior) {
			emptyBehavior = new Behavior();
			//fake an elem
			emptyBehavior.elem = {};
			return new Behavior( subscriptionText, emptyBehavior );
		}

		//new Behavior(subscriptionText, parentBehavior);
		//
		//private data
		this.sub = [];
		this.pub = [];
		this.behaviors = [];

		while ((match = rSubscriptionProperty.exec( subscriptionText ))) {

			var prefix = match[1],
				prop = $.trim( match[2] ),
				value = $.trim( match[3] );

			if (prefix) {

				this[prefix == "$" ? "pub" : "sub"].push( { eventTypes: prop, value: value } );

			} else {

				if (prop == "ns") {
					nsProperty = value;

				} else {
					this.behaviors.push( { behaviorName: prop, value: value} );
				}
			}
		}

		this.ns = mergePath( mergePath( parentBehavior.ns, behaviorNs ), nsProperty );
		//shared data
		this.text = subscriptionText;
		this.elem = parentBehavior.elem;
		this.subscriptions = parentBehavior.subscriptions;

		if (parentBehavior.elemBehavior) {
			this.elemBehavior = parentBehavior.elemBehavior;
		} else {
			this.elemBehavior = this;
			$( this.elem ).hmData( "ns", this.ns );
		}

		this.options = mergeOptions( parentBehavior.options, behaviorOptions );

		this.importBehaviors();
		this.importSubscriptions( "sub" );
		this.importSubscriptions( "pub" );

		this.debug && this.print();

	}

	Behavior.prototype = {

		importBehaviors: function() {

			var i,
				behaviorName,
				referencedBehavior,
				behavior,
				subTextParts,
				behaviorNs,
				behaviorOptions,
				behaviors = this.behaviors;

			for (i = 0; i < behaviors.length; i++) {

				behavior = behaviors[i];
				behaviorName = behavior.behaviorName;

				//if value is "path|option1|option2"
				//
				subTextParts = rBehaviorText.exec( behavior.value );
				behaviorNs = subTextParts[1]; // "path"
				behaviorOptions = subTextParts[3]; //"option1|option2"

				referencedBehavior = hm.behavior[behaviorName];

				if (isFunction( referencedBehavior )) {

					referencedBehavior(
						this.elem,
						mergePath( this.ns, behaviorNs ),
						this,
						mergeOptions( this.options, behaviorOptions )
					);

				} else if (isString( referencedBehavior )) {

					//recursively import referencedBehavior
					new Behavior( referencedBehavior, this, behaviorNs, behaviorOptions );

				}
			}
		},

		//subscriptionType is either "pub" or "sub"
		importSubscriptions: function( subscriptionType ) {

			var i,
				subscriptionEntry,
				subscriptionParts,
				publisher,
				eventTypes,
				subscriber,
				subscriptionEntries = this[subscriptionType];

			for (i = 0; i < subscriptionEntries.length; i++) {

				subscriptionEntry = subscriptionEntries[i];
				eventTypes = subscriptionEntry.eventTypes;

				subscriptionParts = subscriptionEntry.value.split( rSubscriptionValueSeparator );

				if (subscriptionType == "sub") {

					//path|handler|options|delegate
					publisher = subscriptionParts[0];

					publisher = publisher.startsWith( "$" ) ?
						publisher : //publisher is a view
						mergePath( this.ns, publisher );

					subscriber = this.elem;

				} else {
					//path|handler|options|delegate
					publisher = this.elem;

					subscriber = subscriptionParts[0];
					subscriber = subscriber.startsWith( "$" ) ?
						subscriber : //subscriber is a view
						mergePath( this.ns, subscriber );
				}

				this.appendSub(
					subscriber,
					publisher,
					eventTypes,
					subscriptionParts[1], //handler
					toTypedValue( mergeOptions( this.options, subscriptionParts[2] ) ), //options
					subscriptionParts[3] //delegate
				);
			}

		},

		appendSub: function( subscriber, publisher, eventTypes, handler, options, delegate ) {
			this.subscriptions.push( {
				publisher: publisher,
				eventTypes: eventTypes,
				subscriber: subscriber,
				handler: handler,
				options: options,
				delegate: delegate
			} );
		},

		prependSub: function prependSub( subscriber, publisher, eventTypes, handler, options, delegate ) {
			this.subscriptions.unshift( {
				publisher: publisher,
				eventTypes: eventTypes,
				subscriber: subscriber,
				handler: handler,
				options: options,
				delegate: delegate
			} );
		},

		clearSubs: function() {
			this.subscriptions.splice( 0, this.subscriptions.length );
		}
	};

	function buildElemBehavior( elem ) {

		var subscriptionText,
			elemBehavior,
			subscriptions,
			i,
			subscription,
			$elem = $( elem );

		if (!$elem.hmData( "parsed" ) && (subscriptionText = extractSubscriptionText( elem ))) {

			elemBehavior = new Behavior( elem, subscriptionText );
			subscriptions = elemBehavior.subscriptions;

			elemBehavior.preImport && elemBehavior.preImport();

			for (i = 0; i < subscriptions.length; i++) {

				subscription = subscriptions[i];
				hm.sub(
					subscription.subscriber,
					subscription.publisher,
					subscription.eventTypes,
					subscription.handler,
					subscription.options,
					subscription.delegate
				);
			}

			elemBehavior.postImport && elemBehavior.postImport();
			//
			$elem.hmData( "parsed", true );
		}

		$elem.children().each( function() {
			buildElemBehavior( this );
		} );
	}

	//delay auto parse to way for some dependencies to resolve asynchronously
	setTimeout( function() {
		$( function() {
			if (defaultOptions.autoparseSub) {
				buildElemBehavior( document.documentElement );
			}
		} );
	}, 1 );

	$fn.importBehaviors = function() {
		return this.each( function() {
			buildElemBehavior( this );
		} );
	};

	var logModel = hm( "*log", [] );

	function behavior( name, definition ) {
		if (isObject( name )) {
			for (var key in name) {
				behavior( key, name[key] );
			}
			return this;
		}
		if (isArray( definition )) {
			definition = definition.concat( ";" );
		}
		behavior[name] = definition;
		return this;
	}

	extend( hm, {

		behavior: behavior,

		//#debug
		Behavior: Behavior,
		//#end_debug

		log: function( message, color ) {
			message = color ? "<div style='color:" + color + "'>" + message + "</div> " : message;
			logModel.push( message );
		},

		clearlog: function() {
			logModel.clear();
		}
	} );

	behavior( {

		init: function( elem, path, elemBehavior, options ) {
			rootNode.get( path, elem, path, elemBehavior, options );
		},

		preImport: function( elem, path, elemBehavior, options ) {
			elemBehavior.preImport = function() {
				rootNode.get( path, elem, path, elemBehavior, options );
			};
		},

		postImport: function( elem, path, elemBehavior, options ) {
			elemBehavior.postImport = function() {
				rootNode.get( path, elem, path, elemBehavior, options );
			};
		}
	} );

//#debug
//
//<@depends>subscription.js, model.js, declarative.js</@depends>


	Behavior.prototype.print = function() {
		var subscriptions = this.subscriptions,
			elem = this.elem;

		var html = "<table border='1' cellpadding='6' style='border-collapse: collapse; width:100%;'>" +
		           "<tr><td>element</td><td colspan='6'>" + formatParty( elem ) + "</td> </tr>" +
		           "<tr><td>ns</td><td colspan='6'>" + formatParty( this.ns ) + "</td></tr>" +
		           "<tr><td>text</td><td colspan='6'>" + formatPrint( this.text ) + "</td></tr>";

		if (this.sub.length) {
			html += "<tr><td>sub</td><td colspan='6'>" + formatPrint( this.sub ) + "</td></tr>";
		}

		if (this.pub.length) {
			html += "<tr><td>pub</td><td colspan='6'>" + formatPrint( this.pub ) + "</td></tr>";
		}

		if (this.behaviors.length) {
			html += "<tr><td>behavior</td><td colspan='6'>" + formatPrint( this.behaviors ) + "</td></tr>";
		}

		if (subscriptions.length) {

			html += "<tr>" +
			        "<th></th>" +
			        "<th>subscriber</th>" +
			        "<th>publisher</th>" +
			        "<th>eventTypes</th>" +
			        "<th>handler</th>" +
			        "<th>options</th>" +
			        "<th>delegate</th>" +
			        "</tr>";

			for (var i = 0; i < subscriptions.length; i++) {
				var subscription = subscriptions[i];
				html += "<tr>" +
				        "<td>" + (i + 1) + "</td>" +
				        "<td>" + formatParty( subscription.subscriber, elem ) + "</td>" +
				        "<td>" + formatParty( subscription.publisher, elem ) + "</td>" +
				        "<td>" + formatPrint( subscription.eventTypes ) + "</td>" +
				        "<td>" + formatPrint( subscription.handler ) + "</td>" +
				        "<td>" + formatPrint( subscription.options ) + "</td>" +
				        "<td>" + formatPrint( subscription.delegate ) + "</td>" +
				        "</tr>";
			}
		}

		html += "</table>";
		hm.log( html );

	};

	function formatParty( obj, elem ) {

		if (obj === elem) {
			return "element";
		}

		if (obj.nodeType) {
			return util.encodeHtml( obj.outerHTML ).substr( 0, 100 ) + "...";
		}

		if (isString( obj )) {
			if (obj.startsWith( "$" )) {
				return "$('" + obj.substr( 1 ) + "')";
			} else {
				if (elem) {
					return "hm('" + util.toLogicalPath( obj ) + "')";
				} else {
					return "'" + util.toLogicalPath( obj ) + "'";
				}
			}
		}

	}

	function formatPrint( obj ) {

		if (isUndefined( obj )) {
			return "";
		} else if (isFunction( obj )) {

			return util.encodeHtml( obj + "" ).substr( 0, 100 ) + "...";

		} else if (isObject( obj )) {

			var rtn = "<pre>{";
			var temp = "";
			for (var key in obj) {
				var value = obj[key];
				if (!isUndefined( value )) {
					temp += "\n " + key + ":";
					if (isString( value )) {
						temp += "'" + util.encodeHtml( value ) + "',"
					} else {
						temp += util.encodeHtml( value ) + ","
					}
				}

			}

			if (temp.length != 0) {
				temp = temp.substr( 0, temp.length - 1 );
			}
			rtn += temp;

			rtn += "\n}</pre>";
			rtn = rtn.replace( /\t/g, " " );
			return rtn;
		} else {
			return JSON.stringify( obj );
		}
	}

	hm.behavior.debug = function( elem, path, group, options ) {
		group.debug = true;
	};

	hm.printGroup = function( elem ) {
		if (isString( elem )) {
			elem = $( "<div></div>" ).attr( hm.options.subsAttr, elem )[0];
		} else if (elem.jquery) {
			elem = elem[0];
		}

		(new hm.Behavior( elem )).print();
	};

	//me can be a DOM element, or it can a string path
	hm.printSubscriptions = function( me, subscriptions, type ) {
		if (!subscriptions.length) {
			hm.log( "no subscription" );
			return;
		}

		var subsFromMe, subsToMe;
		if (type == "fromMe") {
			subsFromMe = subscriptions;
		} else if (type == "toMe") {

			subsToMe = subscriptions;

		} else {

			subsFromMe = $( subscriptions ).filter(function( index, item ) {
				return item.subscriber == me;
			} ).get();

			subsToMe = $( subscriptions ).filter(function( index, item ) {
				return item.publisher == me;
			} ).get();

		}

		/*return getSubscriptionsBy( subscriberOrPublisher, function match( item, target ) {
		 return item.subscriber == target || item.publisher == target;
		 } );*/

		var myDescription;

		if (isString( me ) || (me instanceof  hm)) {

			myDescription = "hm('" + util.toLogicalPath( me ) + "')";

		} else {

			myDescription = formatParty( me );

		}

		var html = "<table border='1' cellpadding='6' style='border-collapse: collapse; width:100%;'>";

		if (subsFromMe && subsFromMe.length) {
			html += "<tr><th colspan='6'><b>Subscriber: </b> " + myDescription + "</th></tr>";
			html += "<tr><th></th><th>Publisher:</th><th>events</th><th>workflow</th><th>options</th><th>delegate</th></th>";

			for (var i = 0; i < subsFromMe.length; i++) {
				var subscription = subsFromMe[i];
				html += "<tr>" +
				        "<td>" + (i + 1) + "</td>" +
				        "<td>" + formatParty( subscription.publisher ) + "</td>" +
				        "<td>" + formatPrint( subscription.eventTypes ) + "</td>" +
				        "<td>" + formatPrint( subscription.workflow ) + "</td>" +
				        "<td>" + formatPrint( subscription.options ) + "</td>" +
				        "<td>" + formatPrint( subscription.delegate ) + "</td>" +
				        "</tr>";
			}
		}

		if (subsToMe && subsToMe.length) {
			html += "<tr><th colspan='6'>Publisher: " + myDescription + "</th></tr>";
			html += "<tr><th></th><th>Subscriber:</th><th>events</th><th>workflow</th><th>options</th><th>delegate</th></tr>";

			for (var i = 0; i < subsToMe.length; i++) {
				var subscription = subsToMe[i];
				html += "<tr>" +
				        "<td>" + (i + 1) + "</td>" +
				        "<td>" + formatParty( subscription.subscriber ) + "</td>" +
				        "<td>" + formatPrint( subscription.eventTypes ) + "</td>" +
				        "<td>" + formatPrint( subscription.workflow ) + "</td>" +
				        "<td>" + formatPrint( subscription.options ) + "</td>" +
				        "<td>" + formatPrint( subscription.delegate ) + "</td>" +
				        "</tr>";
			}
		}

		html += "</table>";
		hm.log( html );

	};

//#end_debug//
//<@depends>subscription.js, model.js, declarative.js</@depends>


	var template,
		templateEngineAdapters = {},
		renderContent = {
			initialize: "*templateOptions",
			get: "get", //extensible
			convert: "*dataToMarkup",
			set: "html", //extensible
			finalize: "*importBehaviors"
		};

	function newTemplateWorkflow ( getter, setter, finalizer ) {
		return extend( {}, renderContent,
			isObject( getter ) ? getter : {
				get: getter,
				set: setter,
				finalize: finalizer
			} );
	}

	//options can be : templateId,wrapItem,engineName
	//
	//or it can be
	// {
	//  templateId: "xxx",
	//  wrapItem: true,
	//  engineName: "xxx"
	//}
	hm.activity.initialize.templateOptions = function( publisher, subscriber, handler, options ) {
		if (isString( options )) {

			options = options.split( "," );
			handler.templateId = $.trim( options[0] );
			handler.wrapDataInArray = $.trim( options[1] ) == "true";
			handler.engineName = options[2];

		} else if (isObject( options ) && options.templateId) {

			extend( handler, options );

		} else {

			if (!(handler.templateId = subscriber.hmData( "embeddedTemplate" ))) {

				var templateSource = $.trim( subscriber.html() );
				if (templateSource) {
					templateSource = templateSource.replace( rUnescapeTokens, unescapeTokens );
					handler.templateId = "__" + $.uuid++;
					template.compile( handler.templateId, templateSource );
					subscriber.hmData( "embeddedTemplate", handler.templateId );
					subscriber.empty();
				} else {
					throw "missing template";
				}
			}
		}
	};

	var rUnescapeTokens = /&lt;|&gt;/g;
	var unescapeMap = {
		"&lt;": "<",
		"&gt;": ">"
	};

	var unescapeTokens = function( token ) {
		return unescapeMap[token] || "";
	};

	function RenderContext ( e ) {
		this.modelPath = e.publisher.path;
		this.e = e;
	}

	//shortcut to this.e.publisher.get(xxx);
	RenderContext.prototype.get = function() {
		var publisher = this.e.publisher;
		return publisher.get.apply( publisher, slice.call( arguments ) );
	};

	//this converter is used in handlers which can want to convert data
	// to markup, these handler includes foreach, and newTemplateWorkflow
	//which is the core of all templateHandler
	hm.activity.convert.dataToMarkup = function( data, e ) {

		//if dataSource is an array, it has item(s)
		//or dataSource is non-array
		if (data &&
		    (
			    (isArray( data ) && data.length) || !isArray( data )
			    )
			) {

			//if wrapDataInArray is true, wrap data with [], so that it is an item of an array, explicitly
			//some template engine can automatically wrap your data if it is not an array.
			//if you data is already in array, it treat it as an array of items.
			//however, if you want to want to treat your array as item, you need to wrap it by your
			//self, wrapDataInArray is for this purpose

			var workflow = e.workflow,

			//handler.templateId, handler.wrapDataInArray, handler.engineName is
			//built in during initialization , see initializers.templateOptions
				content = renderTemplate(

					workflow.templateId,

					workflow.wrapDataInArray ? [data] : data,

					//this context can be used to access model within the template
					new RenderContext( e ),

					workflow.engineName );

			if (isPromise( content )) {
				return content;
			}
			if (isString( content )) {

				content = $.trim( content );
			}

			//to work around a bug in jQuery
			// http://jsfiddle.net/jgSrn/1/
			return $( $( "<div />" ).html( content )[0].childNodes );
		} else {
			return "";
		}
	};

	//when the template is render, need to recursively import declarative subscriptions
	hm.activity.finalize.importBehaviors = function( value, e ) {
		$( value ).importBehaviors();

	};

	//add reusable event handler
	hm.workflowType( {
		renderContent: renderContent,
		replace: newTemplateWorkflow( "get", "replaceWith" )
	} );

	extend( hm.behavior, {
		//this is for render everything but just once, after that it will not update itself
		//include
		include: "!init:.|*renderContent",

		//includeOnSelfChange
		//this is for render a single object inside a container
		includeOnSelfChange: "!init after*.:.|*renderContent",

		//includeOnChildChange
		//this is for render an array inside of container view
		//data-sub="includeOnChildChange:path|templateId"
		includeOnChildChange: "!init after*. after*.1:.|*renderContent",

		//includeOnAnyChange
		//this is for render everything, and update view on change of any decedent
		includeOnAnyChange: "!init after*:.|*renderContent",

		//data-sub="replace:path|templateId"
		replace: "!init:.|*replace"
	} );

	//templateOptions is templateId,wrapDataInArray,templateEngineName
	//$("div").renderContent(templateId, path)
	//$("div").renderContent(templateId, path, fn)
	$fn.renderContent = function( templateOptions, modelPath, templateWorkflowExtension ) {

		modelPath = modelPath || "";

		if (isFunction( templateWorkflowExtension )) {
			templateWorkflowExtension = {
				finalize: templateWorkflowExtension
			};
		}

		return this.initView(

			modelPath,

			templateWorkflowExtension ?
				extend( {}, renderContent, templateWorkflowExtension ) :
				"*renderContent",

			templateOptions
		);
	};

	//templateOptions is templateId,wrapDataInArray,templateEngineName
	//$("div").render(path, templateId)
	$fn.replace = function( templateOptions, modelPath, templateHandlerExtension ) {

		if (isFunction( templateHandlerExtension )) {
			templateHandlerExtension = {
				finalize: templateHandlerExtension
			};
		}

		return this.initView(
			modelPath,
			templateHandlerExtension ? extend( {}, hm.workflowType( "replace" ), templateHandlerExtension ) : "*replace",
			templateOptions
		);
	};

	function getTemplateEngine ( engineName ) {
		engineName = engineName || template.defaultEngine;
		if (!engineName) {
			throw "engine name is not specified or default engine name is null";
		}
		var engineAdapter = templateEngineAdapters[engineName];
		if (!engineAdapter) {
			throw "engine '" + engineAdapter + "' can not be found.";
		}
		return engineAdapter;

	}

	function renderTemplate ( templateId, data, renderContext, engineName ) {

		var engineAdapter = getTemplateEngine( engineName, templateId );

		templateId = $.trim( templateId );

		if (engineAdapter.isTemplateLoaded( templateId )) {

			return engineAdapter.render( templateId, data, renderContext );

		} else if (engineAdapter.renderAsync) {

			return engineAdapter.renderAsync( templateId, data, renderContext );

		} else {

			var defer = $.Deferred(),
				cloneEvent = extend( true, {}, renderContext.e ),
				publisher = extend( true, {}, cloneEvent.publisher ),
				clonedContext = extend( true, {}, renderContext );

			cloneEvent.publisher = publisher;
			clonedContext.e = cloneEvent;

			//template.load is implemented in external-template.js
			template.load( templateId ).done( function() {

				var content = engineAdapter.render( templateId, data, clonedContext ),
					rtn = $( content );

				defer.resolve( rtn.selector || !rtn.length ? content : rtn );

			} );

			return defer.promise();

		}
	}

	hm.template = template = {

		defaultEngine: "",

		/*
		 hm.template.myEngine = {
		 render: function( templateId, data, context ) {},
		 compile: function( templateId, source ) {},
		 isTemplateLoaded: function( templateId ) {}
		 };
		 */
		engineAdapter: function( name, engineAdapter ) {
			if (!name) {
				return templateEngineAdapters;
			}
			if (!engineAdapter) {
				return templateEngineAdapters[name];
			}
			engineAdapter.isTemplateLoaded = engineAdapter.isTemplateLoaded || returnTrue;
			templateEngineAdapters[name] = engineAdapter;
			template.defaultEngine = name;
		},

		//dynamically load a template by templateId,
		//it is called by template.render
		//The default implementation required matrix.js
		//but you can override this, all you need
		// is to return is that a promise, when the promise is
		// done, the template should be ready to used
		load: function( templateId ) {
			throw "not implemented";
		},

		//this should be called by hm.template.load after the method
		//get the source of the template
		compile: function( templateId, source, engineName ) {
			return getTemplateEngine( engineName ).compile( templateId, source );
		},

		//build a customized handler which handle the change of model
		//by default
		//getFilter is "get" which is to get model value,
		// it can be a string or function (e) {}
		//
		//setFilter is "html" which is to change the content of the view
		//it can be a string or function (e, value)
		newTemplateWorkflow: newTemplateWorkflow
	};


	if ($.render && $.templates) {

		var engine;


		template.engineAdapter( "jsrender", engine = {

			render: function( templateId, data, context ) {
				if (!$.render[templateId]) {
					this.compile( templateId, document.getElementById( templateId ).innerHTML );
				}
				return $.render[templateId]( data, context );
			},

			compile: function( templateId, source ) {
				$.templates( templateId, {
					markup: source,
					debug: engine.templateDebugMode,
					allowCode: engine.allowCodeInTemplate
				} );
			},

			isTemplateLoaded: function( templateId ) {
				return !!$.render[templateId] || !!document.getElementById( templateId );
			},

			//templateDebugMode is jsRender specific setting
			templateDebugMode: false,

			//allowCodeInTemplate is jsRender specific setting
			allowCodeInTemplate: true
		} );

		var tags = $.views.tags;

		//the following tags a jsrender specific helper
		tags( {
			//#debug
			//{{debugger /}} so that it can stop in template function
			"debugger": function x ( e ) {
				if (x.enabled) {
					debugger;
				}
				return "";
			},
			//#end_debug

			//{{ts /}} so that it can emit a timestamp
			ts: function x () {
				return x.enabled ?
					"<span style='color:red' data-sub='show:/*ts'>updated on:" + (+new Date() + "").substring( 7, 10 ) + "</span>" :
					"";
			},

			//{{indexToNs /}}
			indexToNs: function() {
				var index = this.tagCtx.view.index,
					path = this.ctx.modelPath;

				if (isUndefined( index )) {
					//this is the case when template is render with
					// a single data item instead of array
					index = (this.ctx.e.publisher.count() - 1);
				}

				return "ns:/" + path + "." + index;
			},

			get: function () {
				var publisher = this.ctx.e.publisher;
				return publisher.get.apply( publisher, slice.call( arguments ) );
			},

			prop: function() {
				var index = this.tagCtx.view.index;

				if (isUndefined( index )) {
					//this is the case when template is render with
					// a single data item instead of array
					index = (this.ctx.e.publisher.count() - 1);
				}

				var itemNode = this.ctx.e.publisher.cd( index );
				return itemNode.get.apply( itemNode, slice.call( arguments ) );
			},

			//{{keyToNs /}}
			keyToNs: function() {
				return "ns:/" + this.ctx.modelPath + ".table." + this.ctx.e.publisher.itemKey( this.tagCtx.view.data );
			},

			//{{dataPathAsNs /}}
			dataPathAsNs: function() {
				return "ns:/" + this.ctx.modelPath;
			}

		} );

		tags.ts.render.enabled = true;
		//#debug
		tags["debugger"].render.enabled = true;
		//#end_debug

		hm( "*ts", false );

	}



//


	var Handlebars = window.Handlebars;

	if (!isUndefined( Handlebars )) {

		hm.template.engineAdapter( "handlebars", {

			render: function( templateId, data, context ) {

				return Handlebars.partials[templateId]( data, {
					data: {renderContext: context}
				} );
			},

			compile: function( templateId, source ) {
				Handlebars.registerPartial( templateId, Handlebars.compile( source ) );
			},

			isTemplateLoaded: function( templateId ) {
				return !!Handlebars.partials[templateId];
			}

		} );

		//{{modelPath}}
		Handlebars.registerHelper( "modelPath", function( options ) {
			return options.data.renderContext.modelPath;
		} );

		//{{indexToNs}}
		Handlebars.registerHelper( "indexToNs", function( options ) {
			return "ns:/" + options.data.renderContext.modelPath + "." + options.data.index + ";";
		} );

		//{{keyToNs}}
		Handlebars.registerHelper( "keyToNs", function( options ) {
			var renderContext = options.data.renderContext;

			var rtn = "ns:/" + renderContext.modelPath + ".table." +
			          renderContext.e.publisher.itemKey( this );
			return rtn;
		} );

		//{{get "..hardCode" name}}
		Handlebars.registerHelper( "get", function() {
			var args = arguments,
				last = args.length - 1,
			//args[last].data is options.data
				renderContext = args[last].data.renderContext;

			return renderContext.get.apply( renderContext, slice.call( args, 0, last ) );
		} );

		//{{{prop "link"}}}
		Handlebars.registerHelper( "prop", function() {
			var slice = [].slice,
				args = arguments,
				last = args.length - 1,
				options = args[last],
				data = options.data,
				renderContext = data.renderContext,
				itemNode = renderContext.e.publisher.cd( data.index );

			return itemNode.get.apply( itemNode, slice.call( args, 0, last ) );
		} );

		$( function() {
			$( "script[type=handlebars]" ).each( function() {
				Handlebars.registerPartial( this.id, Handlebars.compile( $( this )[0].innerHTML ) );
			} );
		} );

	}



//
//<@depends>subscription.js, model.js, declarative.js, template.js</@depends>


	function getCheckableControlValue ( $elem ) {
		var elem = $elem[0];
		if (elem.value == "true") {
			return true;
		} else if (elem.value == "false") {
			return false;
		} else if (elem.value !== "on") {
			return elem.value;
		} else {
			return elem.checked;
		}
	}

	//don't change it to because we want to control the search order
	//check findValueAdapter($elem, adapterName)
	//{
	//   name1: adapter1,
	//   name2: adapter2
	//}
	var valueAdapters = [
		{
			//the default view adapter
			name: "textBoxOrDropDown",
			get: function( $elem ) {
				return $elem.val();
			},
			set: function( $elem, value ) {
				if ($elem.val() !== value) {
					$elem.val( value );
				}
			},
			match: returnTrue
		},
		{
			name: "checkbox",
			get: getCheckableControlValue,
			set: function setCheckbox ( $elem, value ) {
				var elem = $elem[0];
				if (isBoolean( value )) {
					elem.checked = value;
				} else {
					elem.checked = (value == elem.value);
				}
			},
			match: function( $elem ) {
				return $elem.is( ":checkbox" );
			}
		},
		{
			name: "radio",
			get: getCheckableControlValue,
			set: function( $elem, value, e ) {
				var elem = $elem[0];
				if (!elem.name) {
					elem.name = e.publisher.path;
				}
				elem.checked = ( util.toString( value ) == elem.value );
			},
			match: function( $elem ) {
				return $elem.is( ":radio" );
			}
		},
		{
			name: "listBox",
			get: function( $elem ) {
				var options = [];
				$elem.children( "option:selected" ).each( function() {
					options.push( this.value );
				} );
				return options;
			},
			set: function( $elem, value ) {

				$elem.children( "option:selected" ).removeAttr( "selected" );

				function fn () {
					if (this.value == itemValue) {
						this.selected = true;
					}
				}

				for (var i = 0, itemValue; i < value.length; i++) {
					itemValue = value[i];
					$elem.children( "option" ).each( fn );
				}
			},
			match: function( $elem ) {
				return $elem.is( "select[multiple]" );
			}
		}
	];

	function findValueAdapter ( $elem, adapterName ) {
		var i, adapter;

		if (adapterName) {
			for (i = valueAdapters.length - 1; i >= 0; i--) {
				adapter = valueAdapters[i];
				if (adapter.name == adapterName) {
					return adapter;
				}
			}
		} else {
			//search from tail to head
			for (i = valueAdapters.length - 1; i >= 0; i--) {
				adapter = valueAdapters[i];
				if (adapter.match && adapter.match( $elem )) {
					return adapter;
				}
			}
		}
	}

	hm.activity.get.getViewValue = function( e ) {
		//e.workflow.getViewValue is initialized when on subscription
		return e.workflow.getViewValue( e.publisher );
	};

	hm.activity.set.setViewValue = function( value, e ) {
		//e.workflow.setViewValue is initialized when on subscription
		return e.workflow.setViewValue( this, value, e );
	};

	function initAdapterMethodForView ( view, workflow, adapterName, methodName ) {

		var adapter = findValueAdapter( view, adapterName );

		if (!adapter || !adapter[methodName]) {

			throw "can not find " + methodName + " method for view";
		}

		workflow[methodName + "ViewValue"] = adapter[methodName];

		if (adapter.convert) {
			workflow.convert = adapter.convert;
		}

		if (!view.hmData( "valueBound" )) {

			adapter.initialize && adapter.initialize( view );

			view.hmData( "valueBound", true );

		}
	}

	hm.workflowType( {

		//set view value with model value
		updateViewValue: {
			initialize: function( publisher, subscriber, workflow, adapterName ) {
				//subscriber is view, trying to getModel setView
				initAdapterMethodForView( subscriber, workflow, adapterName, "set" );

			},
			get: "get",
			set: "*setViewValue"
		},

		//set model value with view value
		updateModelValue: {

			initialize: function( publisher, subscriber, workflow, adapterName ) {
				//publisher is view, trying to getView setModel
				initAdapterMethodForView( publisher, workflow, adapterName, "get" );

			},
			get: "*getViewValue",
			set: "set"
		}
	} );

	//add value adapter
	//the last added using the method, will be evaluated first
	/*
	 //a view adapter is is like
	 {
	 //optional if match function is present
	 name: "adapterName",
	 //
	 //optional if name is present
	 match: function ($elem) { return true; },
	 //
	 //prepare $element
	 initialize: function ($elem) {}
	 //
	 //get a value from element
	 get: function ($elem) {},
	 //
	 //set a value to $element
	 set: function( $elem, value ) {},
	 //
	 //optional, if get function already convert, you don't need this
	 convert: "*commonConvertActivityName" or function (value) {}

	 }
	 * */
	hm.valueAdapter = function( adapter ) {
		if (adapter) {
			valueAdapters.push( adapter );
		} else {
			return valueAdapters;
		}
	};

	//dynamic group
	//support the following
	//
	//val:path
	//val:path|keypress
	//val:path|,updateModel
	//val:path|,updateView
	//val:path|,,date
	//val:path|updateEvent,updateDirection,adapterName
	hm.behavior.val = function( elem, path, elemBehavior, options ) {

		var updateDirection,
			updateEvent,
			adapterName;

		options = options || "";

		if (!options) {
			updateEvent = "change";
		} else {
			options = options.split( "," );
			updateEvent = options[0] || "change"; //by default it is "change"
			updateDirection = options[1]; //undefined, updateView or updateModel
			adapterName = options[2];
		}

		if (!updateDirection || updateDirection == "updateView") {
			elemBehavior.appendSub( elem, path, "init1 after*", "*updateViewValue", adapterName );
		}

		if (!updateDirection || updateDirection == "updateModel") {

			elemBehavior.appendSub( path, elem, updateEvent + " resetVal", "*updateModelValue", adapterName );

		}

	};

	hm.behavior.resetFormValues = function( elem, path, elemBehavior, options ) {

		var $elem = $( elem );

		//this will update the input which use "val" subscription group
		//to update the model with the default value of the input
		function reset () {
			$elem.find( ":input" ).trigger( "resetVal" );
		}

		$elem.bind( "reset", function() {
			//the timeout is necessary,because
			//when the reset event trigger, the default behavior of
			//html that resetting all the value of the input is not done yet
			//so delay the fromReset event
			setTimeout( reset, 1 );
		} );
	};



//
//<@depends>subscription.js, model.js, declarative.js, template.js</@depends>


	defaultOptions.confirmMessage = "Are you sure?";

	function addGroupAndWorkflowType( features ) {
		for (var name in features) {
			var item = features[name];
			hm.behavior[name] = item[0];
			hm.workflowType( name, item[1] );
		}
	}

	hm.activity.get.compareTruthy = function( e ) {
		var expression = e.workflow.options,
			publisher = e.publisher;
		return isUndefined( expression ) ?
			!publisher.isEmpty() :
			publisher.compare( expression );
	};

	hm.activity.initialize.extractClass = function( publisher, subscriber, workflow, options ) {
		var parts = options.split( "," );
		workflow.className = parts[0];
		workflow.options = parts[1];
	};

	addGroupAndWorkflowType( {

		//--------changing view----------
		options: [
			"!init after*:.|*options",
			//add model workflows
			//render <select> options
			{
				//this is actually the execute function, in this workflow
				//there is no set, the content of the view is render
				//in the get function.
				get: function( e ) {

					var options = e.workflow.options,
						subscriber = this,
						value = subscriber.val();

					subscriber.children( "option[listItem]" )
						.remove().end().append(
						function() {
							var html = "";
							$( e.publisher.get() ).each( function() {
								html += "<option listItem='1' value='" + options.value( this ) + "'>" + options.name( this ) + "</option>";
							} );
							return html;
						} ).val( value );

					if (subscriber.val() !== value) {
						$( subscriber.trigger( "change" ) );
					}
				},

				initialize: function( publisher, subscriber, workflow, options ) {
					if (options) {
						var parts = options.split( "," );
						var textColumn = parts[0];
						var valueColumn = parts[1] || parts[0];

						workflow.options = {
							name: function( item ) {
								return item[textColumn];
							},
							value: function( item ) {
								return item[valueColumn];
							}
						};

					} else {

						workflow.options = {
							name: function( item ) {
								return item.toString();
							},
							value: function( item ) {
								return item.toString();
							}
						};
					}
				}
			}
		],

		show: [

			//data-sub="`show:path"
			"!init after*:.|*show",

			{

				get: "*compareTruthy",

				set: function( truthy ) {

					this[truthy ? "show" : "hide"]();

				}
			}

		],

		hide: [

			"!init after*:.|*hide",

			{
				get: "*compareTruthy",

				//use subscription group instead
				set: function( truthy ) {

					this[ truthy ? "hide" : "show"]();
				}
			}
		],

		enable: [

			"!init after*:.|*enable",

			{
				get: "*compareTruthy",

				set: function( truthy ) {

					this.attr( "disabled", !truthy );
				}
			}
		],

		disable: [

			"!init after*:.|*disable",
			{
				get: "*compareTruthy",

				set: function( truthy ) {
					this.attr( "disabled", truthy );
				}
			}
		],

		addClass: [

			"!init after*:.|*addClass",
			{

				initialize: "*extractClass",

				get: "*compareTruthy",

				set: function( truthy, e ) {

					this[truthy ? "addClass" : "removeClass"]( e.workflow.className );
				}
			}
		],

		removeClass: [

			"!init after*:.|*removeClass", {

				initialize: "*extractClass",

				get: "*compareTruthy",

				set: function( truthy, e ) {

					this[truthy ? "removeClass" : "addClass"]( e.workflow.className );

				}
			}
		],

		toggleClass: [

			"!init after*:.|*toggleClass", {

				get: function( e ) {
					var method,
						reverse,
						value = e.publisher.get(),
						className = e.workflow.options;

					if (className) {
						if (className.startsWith( "!" )) {
							reverse = true;
							className = className.substr( 1 );
						}

						method = value ^ reverse ? "addClass" : "removeClass";
					}

					if (e.type == "init") {

						if (className) {

							this[method]( className );

						} else {

							this.addClass( value );
						}

					} else {
						if (className) {

							this[method]( className );

						} else {

							this.removeClass( e.removed ).addClass( value );

						}
					}
				}
			}
		],

		//focus:*isEditMode
		//focus on a view if model is not empty
		focus: [
			"!init after*:.|*focus",
			{
				get: "*compareTruthy",

				set: function( truthy, e ) {

					if (truthy) {
						var subscriber = this;
						setTimeout( function() {
							subscriber.focus().select();
						}, 1 );
					}
				}
			}
		],

		count: [

			"!init after*:.|*count",

			function( e ) {
				var value = e.publisher.get(),
					count = ( "length" in value) ? value.length : value;

				this.text( count );
			}
		],

		dump: [

			"!init *:.|*dump",

			function( e ) {
				if (!e.type.startsWith( "before" )) {
					this.html( "<span style='color:red'>" + e.publisher.path + " : " + e.publisher.toJSON() + "</span>" );
				}
			}
		],

		//alert:path //this will alert the data in model
		//alert:_|hello world //this will alert "hello world"
		alert: [

			"$click:.|*alert",

			function( e ) {
				alert( isUndefined( e.workflow.options ) ? this.get() : e.workflow.options );
			}

		],

		preventDefault: [

			"$click:_|*preventDefault",

			function( e ) {
				e.preventDefault();
			}
		],

		stopPropagation: [

			"$click:_|*stopPropagation",

			function( e ) {
				e.stopPropagation();
			}
		],

		//confirm:_
		//confirm:path
		//confirm:_|your message
		confirm: [

			//replacing "$click:.|*confirm", with dynamic group,
			//so that it can be fix the problem caused by mapEvent
			//as long as it is placed before mapEvent subscription group
			function( elem, path, group, options ) {
				hm.sub( path, elem, "click", "*confirm", options );
			},

			function( e ) {

				var message = isUndefined( e.workflow.options ) ?
					this && this.get && this.get() || defaultOptions.confirmMessage :
					e.workflow.options;

				if (!confirm( message )) {
					e.stopImmediatePropagation();
					e.preventDefault && e.preventDefault();
				}
			}
		],

		///------changing model------------
		hardCode: [
			"$click:.|*hardCode",
			{
				initialize: function( publisher, subscriber, workflowInstance, options ) {
					workflowInstance.hardCode = toTypedValue( options );
				},
				get: function( e ) {
					this.set( e.workflow.hardCode );
				}
			}
		],

		"0": [
			"$click:.|*0",
			function( /*e*/ ) {
				this.set( 0 );
			}
		],

		emptyString: [
			"$click:.|*empty",
			function( /*e*/ ) {
				this.set( "" );
			}
		],

		"null": [
			"$click:.|*null",

			function( /*e*/ ) {
				this.set( null );
			}
		],

		"true": [

			"$click:.|*true",

			function( /*e*/ ) {
				this.set( true );
			}
		],

		"++": [
			"$click:.|*++",

			function( /*e*/ ) {
				this.set( this.get() + 1 );
			}
		],

		"--": [
			"$click:.|*--",
			function( /*e*/ ) {
				this.set( this.get() - 1 );
			}
		],

		"false": [
			"$click:.|*false",
			function( /*e*/ ) {
				this.set( false );
			}
		],

		toggle: [

			"$click:.|*toggle",
			function( /*e*/ ) {
				var subscriber = this;
				subscriber.set( !subscriber.get() );
			}
		],

		sortItems: [
			"$click:.|*sortItems",
			{
				initialize: function( publisher, subscriber, workflow, options ) {
					options = (options || "") && options.split( "," );
					workflow.by = options[0];
					//because options[1] default is undefined
					//so asc is by default
					workflow.asc = !!options[1];
				},
				get: function( e ) {
					var workflow = e.workflow;
					this.sort( workflow.by, workflow.asc );
					workflow.asc = !workflow.asc;
				}
			}
		],

		clear: [

			"$click:.|*clear",

			function( /*e*/ ) {
				this.clear();
			}
		],

		del: [
			"$click:.|*del;confirm:_|_Do you want to delete this item?",

			function( /*e*/ ) {
				this.del();
			}
		]
	} );

	extend( hm.behavior, {

		caption: function( elem, path, elemBehavior, options ) {

			$( elem ).prepend( "<option value=''>" + (options || hm.get( path )) + "</option>" );
		},

		autofocus: function( elem ) {
			setTimeout( function() {
				$( elem ).focus();
			}, 1 );
		},

		mapEvent: function( elem, path, elemBehavior, options ) {
			options = options.split( "," );
			$( elem ).mapEvent( options[0], options[1], options[2] );

		},

		mapClick: function( elem, path, elemBehavior, options ) {
			options = options.split( "," );
			$( elem ).mapEvent( "click", options[0], options[1] );
		},

		logPanel: function( elem, path, elemBehavior, options ) {

			$( elem ).css( "list-style-type", "decimal" ).css( "font-family", "monospace, serif" );

			elemBehavior.appendSub( elem, "*log", "init", function( e ) {
				var allLogs = e.publisher.get();
				for (var i = 0; i < allLogs.length; i++) {
					this.append( "<li>" + allLogs[i] + "</li>" );
				}
			} );

			elemBehavior.appendSub( elem, "*log", "afterCreate.1", function( e ) {
				this.append( "<li>" + e.originalPublisher.raw() + "</li>" );
			} );

			elemBehavior.appendSub( elem, "*log", "afterCreate", function( e ) {
				this.empty();
			} );
		},

		clearlog: "clear:/*log",

		//data-sub="enableLater:path"
		enableLater: "!after*:.|*enable",

		//data-sub="disableLater:path"
		disableLater: "!after*:.|*disable",

		//data-sub="html:path"
		html: "!init after*:.|get html *toString",

		//data-sub="text:path"
		text: "!init after*:.|get text *toString",

		removeIfDel: "!duringDel:.|*fakeGet remove",

		emptyIfDel: "!duringDel:.|*fakeGet empty"

	} );

	hm.newViewEvent( {

		enter: ["keyup", function( e ) {
			return (e.keyCode === 13);
		}],

		esc: ["keyup", function( e ) {
			return (e.keyCode === 27);
		}],

		ctrlclick: ["click", function( e ) {
			return e.ctrlKey;
		}]
	} );



//
/*
 <@depends>
 subscription.js,
 model.js
 </@depends>
 */


	var methodMap = {
		"create": "POST",
		"update": "PUT",
		"destroy": "DELETE",
		"fetch": "GET"
	};

	var entityState = {
		detached: 0,
		unchanged: 1,
		added: 3,
		deleted: 4,
		modified: 5
	};

	function markModified ( e ) {

		var basePath = this.path; //items
		var originalPath = e.originalPublisher.path; //items.1.firstName
		var diffPath = originalPath.substr( basePath.length + 1 ); //1.firstName
		var dotIndex = diffPath.indexOf( "." );
		var entityPath = basePath + "." + diffPath.substr( 0, dotIndex ); //items.1
		var statePath = entityPath + ".__state"; //items.1.__state

		if (originalPath !== statePath &&
		    hm.get( statePath ) == entityState.unchanged) {
			//use set method is deliberate, because we want
			//to raise event
			hm.set( statePath, entityState.modified );
		}
	}

	hm.onAddOrUpdateNode( function( context, index, value ) {
		if (value instanceof hm.Entity) {

			if (value.__state === entityState.detached) {
				value.__state = entityState.added;
			}

			if (isUndefined( hm( context ).get( "__entityContainer" ) )) {
				hm.sub( context, context, "afterUpdate.*", markModified );
				hm( context ).set( "__entityContainer", true );
			}
		}
	} );

	function callStaticAjaxMethod ( node, methodName ) {
		var entity = node.get();

		return entity.constructor[methodName]( entity ).done( function( data ) {

			node.set(

				"__state",

				methodName == "destroy" ?
					entityState.detached :
					entityState.unchanged
			);

			node.trigger( "afterSync." + methodName );
		} );
	}

	//the reason that we don't implement ajax in the instance method is that, we want to
	//support the call from repository node, such node.set("create"), node.set("update")..
	//we want to delegate this call the static method
	hm.Entity = hm.Class.extend(
		//instance method, which is invoked by node.get method
		//or it can be invoked the object directly
		{
			//this state is meaningful only when it entity is inside of repository
			__state: entityState.detached,

			create: function __ () {
				if (this instanceof hm) {
					if (this.get( "__state" ) == entityState.added) {
						return callStaticAjaxMethod( this, "create" );
					}
					throw "entity is not a new item";

				} else {
					// don't use Entity.create(this), because
					// this.constructor is not necessary Entity
					return this.constructor.create( this );

				}
			},

			fetch: function __ () {
				return this instanceof hm ? callStaticAjaxMethod( this, "fetch" ) :
					this.constructor.fetch( this );
			},

			update: function __ () {

				if (this instanceof hm) {
					if (this.get( "__state" ) == entityState.modified) {
						return callStaticAjaxMethod( this, "update" );
					}
				} else {
					return this.constructor.update( this );
				}
			},

			destroy: function __ () {
				if (this instanceof hm) {
					var node = this;
					return callStaticAjaxMethod( this, "destroy" ).done( function() {
						node.del();
					} );
				} else {
					return this.constructor.destroy( this );
				}
			},

			save: function __ () {
				if (this instanceof hm) {

					var state = this.get( "__state" );
					if (state == entityState.added) {

						return this.get( "create" );

					} else if (state == entityState.modified) {

						return this.get( "update" );
					}

				} else {

					throw "not supported";
				}

			}

		},

		//static method, which knows nothing about repository
		{
			state: entityState,

			create: function( instance ) {
				return this.ajax( "create", instance );
			},

			update: function( instance ) {
				return this.ajax( "update", instance );
			},
			destroy: function( instance ) {
				return this.ajax( "destroy", instance );
			},

			fetch: function( instance ) {
				if (instance) {
					return this.ajax( "fetch", instance );
				} else {
					var Constructor = this;
					//the pipe method is used to convert an array of
					// generic object into an array of object of the same "Class"
					return this.ajax( "fetch" ).pipe( function( data ) {
						return $( Constructor.list( data ) ).each(function() {
							this.__state = entityState.unchanged;
						} ).get();
					} );

				}
			},

			getUrl: function( methodName, instance ) {
				var baseUrl = this.url || instance.url,
					id = instance && instance.id;

				return id ? baseUrl + (baseUrl.charAt( baseUrl.length - 1 ) === '/' ? '' : '/') + encodeURIComponent( id ) :
					baseUrl;
			},

			ajax: function( methodName, instance ) {
				var method = methodMap[methodName];

				var ajaxOptions = {
					type: method,
					dataType: 'json',
					url: this.getUrl( methodName, instance ),
					contentType: method == "GET" ? null : "application/json",
					processData: false,
					data: method == "GET" ? null : JSON.stringify( instance )
				};

				return $.ajax( ajaxOptions ).done( function( response ) {
					instance && extend( instance, response );
				} );
			}
		} );

	extend( hmFn, {

		//node function which bridget the hm method to the static method of model
		//subPath is optional
		//method is required create/read/update/del
		//e.g node.sync("create");
		save: function() {
			return this.get( "save" );
		},

		destroy: function() {
			return this.get( "destroy" );
		},

		fetch: function() {
			return this.get( "fetch" );
		}
	} );

//
//<@depends>subscription.js, model.js, declarative.js, template.js</@depends>


	defaultOptions.errors = {
		defaultError: "Please enter a valid value"
	};

	var afterUpdateAndCheckValidity = "afterUpdate* checkValidity",
		invalidPaths = shadowRoot.invalidPaths = [],
		invalidPathsModel = hm( "*invalidPaths" ),
		rEmpty = /^\s*$/,
		rEmail = /^((([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+(\.([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+)*)|((\x22)((((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(([\x01-\x08\x0b\x0c\x0e-\x1f\x7f]|\x21|[\x23-\x5b]|[\x5d-\x7e]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(\\([\x01-\x09\x0b\x0c\x0d-\x7f]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]))))*(((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(\x22)))@((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.?$/i,
		rUrl = /^(https?|ftp):\/\/(((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:)*@)?(((\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5]))|((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.?)(:\d*)?)(\/((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)+(\/(([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)*)*)?)?(\?((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)|[\uE000-\uF8FF]|\/|\?)*)?(\#((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)|\/|\?)*)?$/i,
		rDateISO = /^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/,
		rNumber = /^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/,
		rDigit = /^\d+$/,
		rInvalidDate = /Invalid|NaN/,
		rRegEx = /^(\/(\\[^\x00-\x1f]|\[(\\[^\x00-\x1f]|[^\x00-\x1f\\\/])*\]|[^\x00-\x1f\\\/\[])+\/[gim]*)(,(.*))*$/,
		rFirstToken = /([^,]+)(,(.*))?/,
		rFirstTwoToken = /(\w+),(\w+)(,(.*))?/;

	/*	this method is to create a subscription group and
	 workflow type using the name of validator
	 and also add a class rule using the name of validator
	 so make sure the name of validator do not collide with other validator

	 a validator is object like
	 {
	 name: "validatorName",
	 error: "error message"
	 isValid: function( value, options ); // options let user to help the isValid to work better
	 initialize: function(options); //allow user convert string value of modelEvent.options to the options passed in isValid function
	 buildError: function(defaultMessage, options )
	 }
	 */
	hm.validator = function( validator ) {

		if (isArray( validator )) {
			for (var i = 0; i < validator.length; i++) {
				hm.validator( validator[i] );
			}
			return this;
		}

		var validatorName = validator.name;

		if (hm.workflowType( validatorName )) {
			throw "validator name '" + validatorName + "' collide with name in hm.workflowTypes";
		}

		//add default error if applicable
		//user can localize errors message
		if (validator.error) {
			defaultOptions.errors[validatorName] = validator.error;
		}

		var workflowTypeName = "v_" + validatorName;
		hm.workflowType( workflowTypeName, buildValidationWorkflowType( validator ) );

		//data-sub="required:path" or data-sub="required:path|options"
		hm.behavior[validatorName] = "!afterUpdate checkValidity:.|*" + workflowTypeName;

	};

	hm.workflowType( {
		checkValidity: function( e ) {
			if (!hm.checkValidity( this.path )) {
				//because it is the first handler, e.stopImmediatePropagation will
				//stop process all other handler
				e.stopImmediatePropagation();
			}
		},

		// use by group
		// warn: "!after*:*errors|*warn",
		warn: function( e ) {
			//e.publisher points to "model*errors"
			if (e.publisher.isEmpty()) {

				this
					.removeClass( "error" )
					.next( "span.error" )
					.remove();

			} else {

				this
					.addClass( "error" )
					.next( "span.error" )
					.remove()
					.end()
					.after( "<span class='error'>" + e.publisher.get() + "</span>" );
			}
		},

		renderErrorSummary: hm.template.newTemplateWorkflow(
			function( e ) {
				return [e.publisher.getErrors()];
			}
		)
	} );

	extend( hm.behavior, {

		validator: function( elem, path, elemBehavior, options ) {
			if (!options) {
				throw "missing validator path";
			}
			if (!options.startsWith( "#" )) {
				options = "#" + options;
			}
			hm( path ).validator( options );
		},

		//add a click handler to element to checkValidity
		checkValidity: function( elem, path, elemBehavior, options ) {
			//prepend to to subscriptions array
			//so that it is the first subscriptions, and it will be evaluated first
			elemBehavior.prependSub( path, elem, "click", "*checkValidity" );
		},

		resetFormValidity: function( elem, path, elemBehavior, options ) {
			elemBehavior.appendSub( path, elem, "reset", "*fakeGet resetValidity" );
		},

		//$click:.|*fakeGet resetValidity
		resetForm: "resetFormValidity:.;resetFormValues:.",

		resetValidity: "$click:.|*fakeGet resetValidity",

		warn: "!after*:*errors|*warn",

		warnSummary: "!afterUpdate* validityChecked:.|*renderErrorSummary;!validityReset:.|empty"

	} );

	function isPathValid ( path ) {

		if (path === "") {
			return !invalidPaths.length;
		}

		var prefix = path + ".";

		for (var i = 0, invalidPath, length = invalidPaths.length; i < length; i++) {
			invalidPath = invalidPaths[i];
			if (invalidPath == path || invalidPath.startsWith( prefix )) {
				return false;
			}
		}
		return true;
	}

	//$("x").subscribe("person", "checkValidityd", function (e) {
	// alert(e.proposed);
	//}
	hm.subscription.special.validityChanged = {
		setup: function( subscriber, publisher ) {
			var isValidPath = publisher + "*isValid";

			if (isUndefined( hm.get( isValidPath ) )) {
				hm.sub( publisher, "*invalidPaths", "!after*. after*.1", function() {
					var isValid = isPathValid( publisher );
					if (hm.get( isValidPath ) !== isValid) {
						hm.trigger( publisher, publisher, "validityChanged", isValid, !isValid );
						hm.set( isValidPath, isValid );
					}
				} );
			}
		}
	};

	extend( hmFn, {

		/*
		 * 1. the objects in path "*invalidPaths", it holds all the path of model which is in error
		 * 2. the object in path "model*errors", it holds all error message that is
		 * */
		checkValidity: function( subPath ) {

			var fullPath = this.getPath( subPath ); // this.cd( subPath ).path;

			traverseModelNeedValidation( fullPath, function( path ) {
				trigger( path, path, "checkValidity", rootNode.get( path ) );
			} );

			//after checkValidity fired, we can check the invalid paths count for the model,
			var isValid = isPathValid( fullPath );
			//
			hm.trigger( fullPath, fullPath, "validityChecked", isValid );

			return isValid;
		},

		//hm("x").check(validatorName, error)
		//example
		//hm("x").check("number", "my error message")
		//
		//hm("x").check(fnIsValid, error)
		//example
		//hm("x").check(function( value ) { return false; }, "my error message");
		validator: function( validator, options ) {
			var subPath,
				i,
				currentValidator;

			if (isObject( validator )) {

				for (subPath in validator) {

					this.cd( subPath ).validator( validator[subPath] );

				}
			} else {

				if (isFunction( validator ) || (isString( validator ) && validator.startsWith( "#" ))) {

					if (isString( validator )) {
						validator = this.raw( validator.substr( 1 ) );
					}

					hm.handle( this.path, afterUpdateAndCheckValidity, function( e ) {
						var publisher = e.publisher,
							previousError = validator.previousError;

						//don't check when it is empty
						if (!isEmptyString( e.proposed )) {

							var errorMessage = validator( publisher.get() );

							if (errorMessage === false) {
								errorMessage = defaultOptions.errors.defaultError;
							}

							if (isString( errorMessage )) {
								// the "!=" is deliberate, don't change to "!=="
								if (errorMessage != previousError) {

									publisher.addError( errorMessage );

									if (!previousError) {
										publisher.removeError( previousError );
									}

									validator.previousError = errorMessage;
								}

							} else {
								if (previousError) {
									publisher.removeError( previousError );
									validator.previousError = "";
								}
							}
						} else {
							if (previousError) {
								publisher.removeError( previousError );
								validator.previousError = "";
							}
						}

					} );

				} else if (isString( validator )) {

					hm.handle( this.path, afterUpdateAndCheckValidity, "*v_" + validator, options );

				} else if (isArray( validator )) {

					for (i = 0; i < validator.length; i++) {

						currentValidator = validator[i];

						if (isArray( currentValidator )) {
							this.validator( currentValidator[0], currentValidator[1] );

						} else {
							this.validator( currentValidator );
						}
					}
				}

			}
			return this;
		},

		resetValidity: function() {
			resetValidity( this.path );

			if (!isPrimitive( this.get() )) {
				traverseModelNeedValidation( this.path, resetValidity );
			}
			hm.trigger( this.path, this.path, "validityReset" );
		},

		addError: function( error ) {
			this.createIfUndefined( "*errors", [] )
				.cd( "*errors" )
				.pushUnique( error );

			invalidPathsModel.pushUnique( this.path );
			return this;

		},

		removeError: function( error ) {

			var errors = this.createIfUndefined( "*errors", [] ).cd( "*errors" );
			errors.removeItem( error );
			if (errors.isEmpty()) {
				invalidPathsModel.removeItem( this.path );
			}
			return this;
		},

		getErrors: function() {

			var i,
				path = this.path,
				invalidPath,
				rtn = [];

			for (i = 0; i < invalidPaths.length; i++) {
				invalidPath = invalidPaths[i];
				if (invalidPath == path || invalidPath.startsWith( path )) {
					rtn = rtn.concat( hm.get( invalidPath + "*errors" ) );
				}
			}
			return rtn;
		}

	} );

	hm.checkValidity = function( path ) {
		return rootNode.checkValidity( path );
	};

	//when path is deleted, remove it from invalidPathsModel
	hm.onDeleteNode( function( path ) {
		invalidPathsModel.removeItem( path );
	} );

	function buildRegexFn ( ex, reverse ) {
		return reverse ? function( value ) {
			return !ex.test( value );
		} : function( value ) {
			return ex.test( value );
		};
	}

	function defaultErrorBuilder ( format, options ) {
		return options.error || format.supplant( options );
	}

	hm.validator.defaultErrorBuilder = defaultErrorBuilder;
	hm.validator.buildRegexFn = buildRegexFn;

	hm.validator( [
		{
			name: "required",
			error: "This field is required.",
			//when it is checked it is always true
			isValid: returnTrue
		},
		{
			name: "email",
			error: "Please enter a valid email address.",
			isValid: buildRegexFn( rEmail )
		},
		{
			name: "url",
			error: "Please enter a valid URL.",
			isValid: buildRegexFn( rUrl )
		},
		{
			name: "date",
			error: "Please enter a valid date.",
			isValid: function( value ) {
				return !rInvalidDate.test( new Date( value ).toString() );
			}
		},
		{
			name: "dateISO",
			error: "Please enter a valid date (ISO).",
			isValid: buildRegexFn( rDateISO )
		},
		{
			name: "number",
			error: "Please enter a valid number.",
			isValid: buildRegexFn( rNumber )
		},
		{
			name: "digits",
			error: "Please enter only digits.",
			isValid: buildRegexFn( rDigit )

		},
		{
			name: "creditcard",
			error: "Please enter a valid credit card number.",
			isValid: function( value ) {
				if (/[^0-9\-]+/.test( value )) {
					return false;
				}

				var nCheck = 0,
					nDigit = 0,
					bEven = false,
					cDigit;

				value = value.replace( /\D/g, "" );

				for (var n = value.length - 1; n >= 0; n--) {
					cDigit = value.charAt( n );
					nDigit = parseInt( cDigit, 10 );
					if (bEven) {
						if ((nDigit *= 2) > 9) {
							nDigit -= 9;
						}
					}
					nCheck += nDigit;
					bEven = !bEven;
				}

				return (nCheck % 10) === 0;
			}

		},
		{
			name: "minlength",
			error: "Please enter at least {minlength} characters.",
			isValid: function( value, options ) {

				return value.length >= options.minlength;

			},
			initialize: function( publisher, subscriber, handler, options ) {
				var match;
				if (options && (match = rFirstToken.exec( options ))) {

					handler.options = {
						minlength: +match[1],
						error: match[3]
					};
				} else {
					throw "invalid options for minlength validator";
				}
			},

			buildError: defaultErrorBuilder
		},
		{
			name: "maxlength",
			error: "Please enter no more than {maxlength} characters.",
			isValid: function( value, options ) {

				return value.length <= options.maxlength;

			},
			initialize: function( publisher, subscriber, handler, options ) {
				var match;
				if (options && (match = rFirstToken.exec( options ))) {
					handler.options = {
						maxlength: +match[1],
						error: match[3]
					};
				} else {
					throw "invalid options for maxlength validator";
				}
			},
			buildError: defaultErrorBuilder
		},
		{
			name: "rangelength",
			error: "Please enter a value between {minlength} and {maxlength} characters long.",
			isValid: function( value, options ) {

				return value.length >= options.minlength &&
				       value.length <= options.maxlength;

			},
			initialize: function( publisher, subscriber, handler, options ) {
				var match;
				if (options && (match = rFirstTwoToken.exec( options ))) {
					handler.options = {
						minlength: +match[1],
						maxlength: +match[2],
						error: match[4]
					};
				} else {
					throw "invalid options for rangelength validator";
				}
			},
			buildError: defaultErrorBuilder

		},
		{
			name: "min",
			error: "Please enter a value greater than or equal to {min}.",
			isValid: function( value, options ) {

				return value >= options.min;

			},
			initialize: function( publisher, subscriber, handler, options ) {
				var match;
				if (options && (match = rFirstToken.exec( options ))) {
					handler.options = {
						min: +match[1],
						error: match[3]
					};
				} else {
					throw "invalid options for min validator";
				}

			},
			buildError: defaultErrorBuilder
		},
		{
			name: "max",
			error: "Please enter a value less than or equal to {max}.",
			isValid: function( value, options ) {

				return value <= options.max;

			},
			initialize: function( publisher, subscriber, handler, options ) {
				var match;
				if (options && (match = rFirstToken.exec( options ))) {
					handler.options = {
						max: +match[1],
						error: match[3]
					};
				} else {
					throw "invalid options for max validator";
				}
			},
			buildError: defaultErrorBuilder
		},
		{
			name: "range",
			error: "Please enter a value between {min} and {max}.",
			isValid: function( value, options ) {

				return value >= options.min && value <= options.max;

			},
			initialize: function( publisher, subscriber, handler, options ) {
				var match;
				if (options && (match = rFirstTwoToken.exec( options ))) {
					handler.options = {
						min: +match[1],
						max: +match[2],
						error: match[4]
					};
				} else {
					throw "invalid options for range validator";
				}
			},
			buildError: defaultErrorBuilder
		},
		{
			name: "equal",
			error: "Please enter the same value again.",
			isValid: function( value, options ) {
				return rootNode.get( options.comparePath ) === value;
			},
			initialize: function( publisher, subscriber, handler, options ) {
				var match;
				if (options && (match = rFirstToken.exec( options ))) {

					var comparePath = publisher.cd( match[1] ).path;
					handler.options = {
						comparePath: comparePath,
						error: match[3]
					};

					publisher.sub( comparePath, "afterUpdate", function( e ) {
						if (!this.isEmpty()) {
							trigger(
								this.path,
								this.path,
								"checkValidity",
								this.get() //proposed value
							);
						}
					} );

				} else {
					throw "invalid options for equal validator";
				}
			}
		},
		{
			name: "regex",
			error: "Please enter a value match with required pattern.",
			isValid: function( value, options ) {
				return options.regex.test( value );
			},
			initialize: function( publisher, subscriber, handler, options ) {
				var match;

				if (options && (match = rRegEx.exec( options ))) {
					handler.options = {
						regex: eval( match[1] ),
						error: match[5]
					};
				} else {
					throw "invalid options for regex validator";
				}
			}
		},
		{
			name: "fixedValue",
			error: 'Please enter value "{fixedValue}"',
			isValid: function( value, options ) {
				return value == options.fixedValue;
			},
			initialize: function( publisher, subscriber, handler, options ) {
				var match;
				if (isString( options )) {
					match = /^(\w+)(,(.*))*$/.exec( options );
					if (match) {
						handler.options = {
							fixedValue: toTypedValue( match[1] ),
							error: match[3]
						};
					}
				} else if (isObject( options )) {

					handler.options = options;

				} else if (!isUndefined( options )) {

					handler.options = {
						fixedValue: options
					};

				} else {
					throw "missing options in fixedValue validator";
				}
			},
			buildError: defaultErrorBuilder
		}
	] );

	function resetValidity ( path ) {
		var errorsModel = hm( path + "*errors" );
		if (!errorsModel.isEmpty()) {
			errorsModel.clear();
			invalidPathsModel.removeItem( path );
		}
	}

	var isRequired = hm.workflowType( "v_required" ).get;

	function isModelRequired ( path ) {
		var subscriptionByModel = hm( path ).subsToMe();// subscriptions.getByPublisher( path );
		for (var i = 0; i < subscriptionByModel.length; i++) {
			var subscription = subscriptionByModel[i];
			if (subscription.workflow.get === isRequired) {
				return true;
			}
		}
		return false;
	}

	function buildErrorMessage ( validator, options ) {

		//named validator normally has a defaultError
		var defaultError = validator.name && defaultOptions.errors[validator.name];

		//if validator has buildError function, this take the highest priority
		if (validator.buildError) {

			//return userError || format.apply( null, [defaultError].concat( options.minlength ) );
			return validator.buildError( defaultError, options );

			//if defaultError is format string,
		} else {

			//userError is normally passed in options of each instance
			var userError = isObject( options ) ? options.error : options;

			if (defaultError && defaultError.contains( "{0}" )) {

				return defaultError.format.apply( defaultError, userError.split( "," ) );

			} else {

				return userError || defaultError || validator.error;
			}
		}
	}

	function buildValidationWorkflowType ( validator ) {

		return {

			initialize: validator.initialize,

			get: function( e ) {

				//if it violate required rule, don't do further validation,
				//as we expect the required rule will capture it first.
				var isValid,
					violateRequiredRule,
					publisher = e.publisher,
					options = e.workflow.options,
					proposed = e.proposed,
					errorMessage = buildErrorMessage( validator, options );

				//if model is empty, only check the "require" validator
				//If it is required, then it is invalid, no further validation is checked
				//if it is not required, it is valid, no further validation is checked
				if (isEmptyString( proposed )) {

					if (isModelRequired( publisher.path )) {
						isValid = false;
						violateRequiredRule = true;
					} else {
						isValid = true;
					}

				} else {

					isValid = validator.isValid( proposed, options );
				}

				if (!isValid) {

					//add error when the current rule is the "required rule"
					//or when "required" rule is not violated
					if (!violateRequiredRule || validator.name === "required") {
						publisher.addError( errorMessage );
					} else {
						publisher.removeError( errorMessage );
					}
				} else {
					publisher.removeError( errorMessage );
				}
			}
		};
	}

	function traverseModelNeedValidation ( path, callback ) {

		//the following code try to trigger the "checkValidity" event, so that the validator will
		// be called to check current value of the model
		//you can not call afterUpdate, because there might trigger other non-validator handler
		//that are attached to afterUpdate
		var allSubscriptions = hm.subscription.getAll();
		var checkValiditydPaths = {};

		for (var i = allSubscriptions.length - 1, subscription, publisherPath; i >= 0; i--) {

			subscription = allSubscriptions[i];
			publisherPath = subscription.publisher;

			var isValidationRequired =
				isString( publisherPath ) && !checkValiditydPaths[publisherPath] &&
				publisherPath.startsWith( path ) &&
				subscription.eventTypes.contains( "checkValidity" );

			if (isValidationRequired) {

				checkValiditydPaths[publisherPath] = true;
				callback( publisherPath );

			}
		}
	}

	function isEmptyString ( value ) {
		return value === null || value === undefined || rEmpty.test( value );
	}


	//start of matrix core.js
	var urlStore = {},
		promiseStore = {},
		dependencyStore = {},
		loaderDefinitionStore = {},
		loaderStore = {},
		dummyLink = document.createElement( "a" ),
		rComma = /,/,
		rSpace = /\s+/g,
		rQuery = /\?/,
		rFileExt = /\.(\w+)$/,
		rFileName = /(.+)\.\w+$/,
		fileExtsion,
		fileName,
		loaderCommands,
		loadFilters,
		require,
	//match "http://domain.com" , "/jkj"
		rAbsoluteUrl = /^http[s]?:\/\/|^\//,
		rUrlParts = /^([\w\+\.\-]+:)(?:\/\/([^\/?#:]*)(?::(\d+))?)?/,
		ajaxLocParts = rUrlParts.exec( location.href.toLowerCase() ) || [],
		hashValue = "",
		hashKey = "v",
		rVersionHash,
		loadCallbacks = [],
		failCallbacks = [],
		unloadCallbacks = [],

		loaderFinders,
		loaderMapper = {},
	//for parallel loading
	// matrix([holdReady,] moduleIdString, loadByOrder)
	//
	//for serial loading and mixed serial/parallel loading strategy
	// matrix([holdReady,] moduleIdArray)
		matrix = window.matrix = function( holdReady, moduleIds, loadByOrder ) {
			var rtnPromise;
			if (typeof holdReady !== "boolean") {
				//by default it is false
				loadByOrder = moduleIds;
				moduleIds = holdReady;
				holdReady = false;
			}
			if (!moduleIds) {
				return;
			}

			holdReady = holdReady && !$.isReady;

			rtnPromise = loadModule( moduleIds, loadByOrder );

			if (holdReady) {

				$.holdReady( true );

				rtnPromise.done( function() {
					$.holdReady();
					//same as the following
					//$.holdReady( false );
					//$.ready( true );
				} );
			}

			return rtnPromise.done( invokeLoadCallbacks ).fail( invokeFailCallbacks );
		};


	function invokeCallbacks( callbacks ) {
		return function() {
			var args = slice.call( arguments );
			for (var i = 0; i < callbacks.length; i++) {
				callbacks[i].apply( this, args );
			}
		};
	}

	var invokeFailCallbacks = invokeCallbacks( failCallbacks ),
		invokeLoadCallbacks = invokeCallbacks( loadCallbacks ),
		invokeUnloadCallbacks = invokeCallbacks( unloadCallbacks );

	function loadModule( moduleIds, loadByOrder ) {

		if (typeof moduleIds === "string") {

			if (loadByOrder) {
				var i = 1,
					keys = splitByComma( moduleIds );

				//create dependency in order
				while (i < keys.length) {
					require( keys[i], keys[i - 1] );
					i++;
				}
				moduleIds = keys[keys.length - 1];
			}

			return loadModuleInParallel( moduleIds );

		} else if ($.isArray( moduleIds )) {

			//if it is moduleIdArray, load one after previous is fully loaded
			return loadModuleInSerial( moduleIds );

		}
		throw "resource parameter should be an array or string";
	}

	//resourceString is like "a.js, b.css, c.tmpl"
	function loadModuleInParallel( moduleIdString ) {
		var promises = [],
			rtnPromise,
			resourceArray = splitByComma( moduleIdString );

		if (resourceArray.length === 1) {
			rtnPromise = loadIndependentModule( resourceArray[0] );
		}
		else {
			for (var i = 0; i < resourceArray.length; i++) {
				promises.push( loadIndependentModule( resourceArray[i] ) );
			}
			rtnPromise = $.when.apply( $, promises );
		}

		return augmentPromise( rtnPromise ).fail( function() {
			matrix.unload( moduleIdString );
		} );
	}

	//resources can be "a.js, b.css, c.tmpl"
	//it can be ["a.js", "b.css", "c.tmpl"]
	//or ["a.js,b.css", ["c.tmpl", "d.tmpl"], "e.css"] and so on
	//it serial load the top level resource unit, within each resource unit, use smart
	//loader matrix
	function loadModuleInSerial( moduleIdArray ) {
		var rtnPromise,
			i,
			toReleaseResource = [],
			currentResourceStringOrArray,
			sharedState = {
				ok: true
			};

		for (i = 0; i < moduleIdArray.length; i++) {
			currentResourceStringOrArray = moduleIdArray[i];
			toReleaseResource.push( currentResourceStringOrArray );

			if (i === 0) {

				rtnPromise = loadModule( currentResourceStringOrArray )
					.fail( makeReleaseFn( currentResourceStringOrArray, sharedState ) );

			} else {

				rtnPromise = rtnPromise.nextLoad( currentResourceStringOrArray )
					.fail( makeReleaseFn( toReleaseResource.slice(), sharedState ) );
			}
		}

		return augmentPromise( rtnPromise );
	}

	function makeReleaseFn( resourceStringOrArray, sharedState ) {
		return function() {
			if (sharedState.ok) {
				matrix.unload( resourceStringOrArray );
				sharedState.ok = false;
			}
		};
	}

	function loadIndependentModule( moduleId ) {
		var loader = findLoader( moduleId );
		if (loader) {

			return loadIndependentModuleWithLoader( moduleId, loader );

		} else {

			//#debug
			matrix.debug.log( "try to load missing loader " + fileExtsion( moduleId ) + ".loader" );
			//#end_debug

			return matrix( fileExtsion( moduleId ) + ".loader" ).nextLoad( moduleId );
		}
	}

	function loadIndependentModuleWithLoader( moduleId, loader ) {

		//#debug
		matrix.debug.log( "try to load " + moduleId + " @ " + matrix.url( moduleId ) );
		//#end_debug

		var promise = accessPromise( moduleId );

		if (!promise) {

			//#debug
			matrix.debug.log( "  loading " + moduleId + " @ " + matrix.url( moduleId ) );
			//#end_debug

			promise = loader.load( moduleId );
			if (!promise || !promise.done) {
				//if it is not a promise
				promise = $.Deferred().resolve( moduleId, promise ).promise();
			}

			if (!loader.noRefCount) {
				//add the promise to cache,
				//in the future, it can be retrieved by accessPromise(moduleId)
				accessPromise( moduleId, promise );
			}
		}
		//#debug
		else {
			matrix.debug.log( "  found loaded module " + moduleId + " @ " + matrix.url( moduleId ) );
		}
		//#end_debug

		//preload module will never be counted for reference
		//as we don't want that to be unloaded
		if (promise.refCount !== "staticLoaded") {
			promise.refCount = promise.refCount ? promise.refCount + 1 : 1;
		}
		return promise;
	}

	function accessPromise( moduleId, promise ) {
		if (moduleId === undefined) {
			return promiseStore;
		} else {
			if (promise === undefined) {
				if (arguments.length === 1) {
					return promiseStore[moduleId];
				} else {
					delete promiseStore[moduleId];
				}
			} else {
				promiseStore[moduleId] = promise;
				return promise;
			}
		}
	}

	//add a promise.nextLoad method dynamically, so that it can
	//be used load other module when current promise finished
	//the nextLoad method is a smartLoad method, use the same way in which
	//you call matrix
	function augmentPromise( promise ) {
		var nextDefer = $.Deferred();

		//nextLoad method load after the current currentPromise is done
		promise.nextLoad = function( moduleId ) {
			var nextLoadArguments = slice.call( arguments );
			promise.then(
				function() {
					matrix.apply( null, nextLoadArguments ).then(
						function() {
							nextDefer.resolve.apply( nextDefer, slice.call( arguments ) );
						},
						function() {
							nextDefer.reject( moduleId );
						} );
				},
				function() {
					nextDefer.reject( moduleId );
				} );

			return augmentPromise( nextDefer.promise() );
		};

		promise.andLoad = function() {
			var currentPromise = matrix.apply( null, arguments );
			return augmentPromise( $.when( currentPromise, promise ) );
		};

		return promise;
	}

	function splitByComma( text ) {
		return text.replace( rSpace, "" ).split( rComma );
	}

	function isCrossDomain( url ) {
		var parts = rUrlParts.exec( url.toLowerCase() );
		return !!( parts &&
		           ( parts[ 1 ] != ajaxLocParts[ 1 ] || parts[ 2 ] != ajaxLocParts[ 2 ] ||
		             ( parts[ 3 ] || ( parts[ 1 ] === "http:" ? 80 : 443 ) ) !=
		             ( ajaxLocParts[ 3 ] || ( ajaxLocParts[ 1 ] === "http:" ? 80 : 443 ) ) )
			);
	}

	function fullUrl( urlRelativeToBaseUrl ) {

		dummyLink.href = rAbsoluteUrl.test( urlRelativeToBaseUrl ) ? urlRelativeToBaseUrl :
			matrix.baseUrl + urlRelativeToBaseUrl;

		return isCrossDomain( urlRelativeToBaseUrl ) ? dummyLink.href : addHash( dummyLink.href );
	}

	function convertPipelineToLoadFunction( pipeline ) {

		for (var key in pipeline) {
			attachFilter( pipeline, key );
		}

		var staticLoaded = pipeline.staticLoaded || loadFilters.staticLoaded.returnFalse,
			getSource = pipeline.getSource || loadFilters.getSource.getTextByAjax,
			compile = pipeline.compile || loadFilters.compile.globalEval,
			crossSiteLoad = pipeline.crossSiteLoad || loadFilters.crossSiteLoad.getScript,
			buildDependencies = pipeline.buildDependencies || loadFilters.buildDependencies.parseRequireTag,
			buildUnload = pipeline.buildUnload || loadFilters.buildUnload.parseUnloadTag;

		if (!compile && !crossSiteLoad) {
			throw "module loader must implement at least one of compile, crossSiteLoad";
		}

		return function( moduleId ) {
			var defer = $.Deferred(),
				promise = defer.promise(),
				url;

			if (staticLoaded( moduleId )) {

				//#debug
				matrix.debug.log( "    bypass staticLoadeded module " + moduleId + " @ " + matrix.url( moduleId ) );
				//#end_debug
				promise.refCount = "staticLoaded";
				defer.resolve( moduleId );

			} else {
				url = matrix.url( moduleId );
				if (!compile || isCrossDomain( url )) {

					if (!crossSiteLoad) {
						throw "loader does not support cross domain loading";
					}
					//#debug
					matrix.debug.log( "    cross-site fetch " + moduleId + " @ " + url );
					//#end_debug
					var crossSiteLoadPromise = crossSiteLoad( moduleId );
					if (crossSiteLoadPromise && crossSiteLoadPromise.done) {
						//crossSiteLoad need to load depedencies as well
						return crossSiteLoadPromise;
					} else {
						defer.resolve( moduleId, crossSiteLoadPromise );
					}

				} else {

					//#debug
					matrix.debug.log( "    local fetch " + moduleId + " @ " + url );
					//#end_debug

					getSource( moduleId ).then(
						function( sourceCode ) {

							//#debug
							matrix.debug.log( "      parsing content of " + moduleId );
							//#end_debug

							if (buildUnload) {

								//#debug
								matrix.debug.log( "        buildUnload for " + moduleId );
								//#end_debug

								var unload = buildUnload( sourceCode, moduleId );

								if (unload) {
									//#debug
									matrix.debug.log( "          unload created for " + moduleId );
									//#end_debug

									accessPromise( moduleId ).unload = unload;
								}

							}

							if (buildDependencies) {

								//#debug
								matrix.debug.log( "        buildDependencies for " + moduleId );
								//#end_debug

								var embeddedDependencies = buildDependencies( moduleId, sourceCode );
								if (embeddedDependencies) {
									//#debug
									matrix.debug.log( "          dependencies found for " + moduleId + ":" + embeddedDependencies );
									//#end_debug
									require( moduleId, embeddedDependencies );
								}
							}

							var runcompile = function() {

								//#debug
								matrix.debug.log( "      compiling " + moduleId + " @ " + url );
								//#end_debug

								var result = compile && compile( moduleId, sourceCode );
								//delay defer.resolve a for while to wait for the compile result
								//to take effect, if compile is $.globalEval
								setTimeout( function() {
									if (!defer.dontResolve) {
										defer.resolve( moduleId, result );
										delete promise.defer;
									}
								}, 5 );
							};

							var dependencies = require( moduleId );

							//load dependencies because it combines static dependentModuleString
							//and dynamic dependentModuleString
							if (dependencies) {
								matrix( dependencies ).then( runcompile, function() {
									defer.reject( moduleId );
									delete promise.defer;
								} );
							} else {
								runcompile();
							}

						},
						function() {
							defer.reject( moduleId );
							delete promise.defer;
						}
					);
				}
				if (!isResolved( defer )) {
					promise.defer = defer;
				}
			}
			return promise;
		};
	}

	var isResolved = $.Deferred().isResolved ? function( promise ) {
		return promise.isResolved();
	} : function( promise ) {
		return promise.state() == "resolved";
	};

	function addHash( url ) {
		url = removeHash( url );
		return hashValue ?
			url + ( rQuery.test( url ) ? "&" : "?" ) + hashKey + "=" + hashValue :
			url;
	}

	function removeHash( url ) {
		if (hashValue === "") {
			return url;
		} else {
			return url.replace( rVersionHash, "" );
		}
	}

	$.extend( matrix, {

		//unload(loadCallback) or unload(unloadCallback, remove=true)
		//unload(moduleIdString)
		//unload(moduleIdArray)
		unload: function( moduleIds, remove ) {
			var i,
				moduleId,
				dependencies,
				promise;

			if ($.isFunction( moduleIds )) {
				if (remove) {
					unloadCallbacks.remove( moduleIds );
				} else {
					unloadCallbacks.push( moduleIds );
				}

			} else {

				if (typeof moduleIds === "string") {
					moduleIds = splitByComma( moduleIds );
				}

				//if there is only one module
				if (moduleIds.length != 1) {

					for (i = 0; i < moduleIds.length; i++) {
						matrix.unload( moduleIds[i] );
					}

				} else {

					//unload serveral modules
					moduleId = moduleIds[0];
					promise = accessPromise( moduleId );

					//make sure it will not throw exception when
					// unloading some module which is not in page
					if (promise && promise.refCount != "staticLoaded") {

						if (--promise.refCount === 0 || remove) {
							var unload = promise.unload || findLoader( moduleId ).unload;

							if (unload) {
								//#debug
								matrix.debug.log( "unloading " + moduleId + " @ " + matrix.url( moduleId ) );
								//#end_debug
								unload( moduleId );
							}

							//delete the promises associated with the module
							accessPromise( moduleId, undefined );
							dependencies = require( moduleId );
							if (dependencies) {
								matrix.unload( dependencies, remove );
							}
						}
						invokeUnloadCallbacks();
					}
				}
			}
		},

		//register a url for module key
		//or get the url of module key
		url: function( moduleId, url ) {
			if (typeof moduleId === "object") {
				for (var k in moduleId) {
					matrix.url( k, moduleId[k] );
				}
				return;
			}

			//if resource's url is not in cache
			//and user is trying to get it
			if (url === undefined) {

				if (arguments.length == 1) {

					if (urlStore[moduleId]) {
						return urlStore[moduleId];
					}

					var loader = findLoader( moduleId );

					return fullUrl(
						loader && loader.url ? loader.url( moduleId ) :
							loader && loader.fileExt ? fileName( moduleId ) + "." + loader.fileExt :
								moduleId
					);

				} else {

					//allow access(key, undefined)
					//to delete the key from storage
					delete urlStore[moduleId];
				}

			} else {
				//user explicit register an url
				var oldUrl = matrix.url( moduleId );
				var newUrl = fullUrl( url );

				if (oldUrl != newUrl) {
					var oldPromise = accessPromise( moduleId );
					if (oldPromise && isResolved( oldPromise )) {
						reload( moduleId, function() {
							urlStore[moduleId] = newUrl;
						} );
					} else {
						urlStore[moduleId] = newUrl;
					}
				}
			}
		},

		// members to configure matrix

		//add dependency to a resource key
		//or get the depeendency of a resource key
		//user can set dependentResourceString manually , which is called static
		//dependentResourceString
		// or can use loader.depend method to return dependentResourceString which is called
		//dynamic dependentResourceString,
		//or we can combind them together
		require: require = function( moduleId, dependencies ) {

			if (typeof moduleId === "object") {
				for (var key in moduleId) {
					if (moduleId.hasOwnProperty( key )) {
						require( key, moduleId[key] );
					}
				}
				return;
			}

			if (dependencies === undefined) {
				//get dependencies
				if (arguments.length == 1) {
					var staticDepencencies = dependencyStore[moduleId];
					var loader = findLoader( moduleId );

					if (loader && loader.require) {
						var dynamicDependencies = loader.require( moduleId );
						if (dynamicDependencies && staticDepencencies) {
							return dynamicDependencies + "," + staticDepencencies;
						} else if (dynamicDependencies) {
							return dynamicDependencies;
						} else {
							return staticDepencencies;
						}
					} else {
						return staticDepencencies;
					}

				} else {
					//delete dependencies
					delete dependencyStore[moduleId];
				}

			} else if (dependencies === true) {
				//for debugging purpuse matrix.depend(moduleId, true)
				var moduleIds = require( moduleId );
				moduleIds = moduleIds && splitByComma( moduleIds );
				if (moduleIds) {
					var rtn = [];
					for (var i = 0; i < moduleIds.length; i++) {
						if (matrix.fileExt( moduleIds[i] ) !== "module") {
							rtn.pushUnique( matrix.url( moduleIds[i] ) );
						}
						rtn.merge( require( moduleIds[i], true ) );
					}
					return rtn;
				}

			} else {
				var newStaticDependencies = getNewStaticDependencies( moduleId, dependencies );
				var oldStaticDependencies = dependencyStore[moduleId];

				if (isDependencisDifferent( newStaticDependencies, oldStaticDependencies )) {

					var oldPromise = accessPromise( moduleId );
					if (oldStaticDependencies && oldPromise && isResolved( oldPromise )) {
						reload( moduleId, function() {
							dependencyStore[moduleId] = newStaticDependencies;
						} );
					} else {
						dependencyStore[moduleId] = newStaticDependencies;
					}
				}
			}
		},

		//the url relative to the current window location, for example "js/"
		//the suffix "/" is important
		//it is used to calculate the real relative url of resource key
		baseUrl: "",

		//matrix.hash(true) --> set a timestamp as hash ?v=2347483748
		//matrix.hash(1,x) --> ?x=1
		//matrix.hash(1) --> ?v=1
		hash: function( value, key ) {
			if (arguments.length) {
				hashValue = value === true ? $.now() : value;
				hashKey = key !== undefined ? key : (hashKey || "v");
				rVersionHash = new RegExp( "[?&]" + hashKey + "=[^&]*" );
			}
			return hashValue === "" ? "" : hashKey + "=" + hashValue;
		},

		//loader name can by the type of a set of resource, such js, tmpl, css
		//or it can be the name of resource itself such as xxx.js
		loader: {
			//create a load function
			resolveDependencies: function( actionAfterDependenciesResolved ) {
				return function( moduleId ) {
					var defer = $.Deferred(),
						dependentResourceString = matrix.require( moduleId );

					if (dependentResourceString) {
						matrix( dependentResourceString ).done( function() {
							defer.resolve( moduleId, actionAfterDependenciesResolved( moduleId ) );
						} );
					} else {
						defer.resolve( moduleId, actionAfterDependenciesResolved( moduleId ) );
					}
					return defer.promise();
				};
			},

			//create a loader
			//matrix.set(loaderName, loaderDefinition);
			//matrix.set(loaderName, baseloaderName, loaderDefinition);
			set: function( loaderName, baseloaderName, loaderDefinition ) {

				if (typeof baseloaderName !== "string") {
					loaderDefinition = baseloaderName;
					baseloaderName = null;
				}
				loaderDefinition = loaderDefinitionStore[loaderName] = $.extend(
					true,
					{},
					loaderDefinitionStore[baseloaderName],
					loaderDefinition );

				var loader = $.extend( true, {}, loaderDefinition );

				$.each( "load,unload,url,require".split( "," ), function( index, value ) {
					attachCommand( loader, value );
				} );

				if ($.isPlainObject( loader.load )) {
					//it is a pipeline, but not a function
					loader.load = convertPipelineToLoadFunction( loader.load );
				}

				if (!$.isFunction( loader.load )) {
					throw "missing load function from loader";
				}

				loaderStore[loaderName] = $.extend( {}, loaderStore[baseloaderName], loader );
			},

			get: function( loaderName ) {
				return loaderName ? loaderDefinitionStore[loaderName] : loaderDefinitionStore;
			},

			commands: loaderCommands = {
				//
				load: {
					//name: function (moduleId) {
					// return a promise object, but make sure to defer.resolve(moduleId, optionalResultValue);
					//or
					// return optionalResultValue
					// }
				},
				unload: {
					//name: function (moduleId) {}
				},
				url: {
					//name: function (moduleId) {
					//  return a url
					// }
				},
				require: {
					//name: function (moduleId) {
					// return a moduleIdString or moduleIdArray
					// return "a.html, b.js"
					// }
				}
			},

			//strategies to find the name of the loader based on moduleId
			//the basic strategy is use the extension as the loader name
			//however you can add your own strategis
			finders: loaderFinders = [
				//find loader by by file extensions directly
				function( moduleId ) {
					return fileExtsion( moduleId );
				},
				//find loader by by file extensions using mapper
				function( moduleId ) {
					var extension = fileExtsion( moduleId );
					var mappedType = loaderMapper[extension];
					if (mappedType) {
						return mappedType;
					}
				}
			],
			//if you want to load a file "*.jpg", which should be loaded
			//with "*.img" loader you should specify matrix.loader.mapFiles("img", "jpg");
			mapFileExtsToLoader: function( fileExtensions, loaderName ) {
				fileExtensions = splitByComma( fileExtensions );
				for (var i = 0; i < fileExtensions.length; i++) {
					loaderMapper[fileExtensions[i]] = loaderName;
				}
			},

			loadFilters: loadFilters = {
				staticLoaded: {
					//name: function (moduleId) {
					//
					//}
				},
				getSource: {

				},
				compile: {
					//name: function( url, sourceCode, moduleId ) {
					//
					//}
				},
				crossSiteLoad: {
					//name: function( url, moduleId ) {
					//}
				},
				buildUnload: {
					//name: function( sourceCode, moduleId ) {
					//  return new Function (sourceCode);
					//}
				},
				buildDependencies: {
					//name: buildDependencies: function( sourceCode, moduleId ) {
					//return "x.js, b.html, c.css";
					//}
				}
			}
		},

		// public utilities

		//if moduleId is xyz.task
		//then resourceType is "task"
		fileExt: fileExtsion = function( moduleId ) {
			return rFileExt.exec( moduleId )[1];
		},

		//if resource key is "a.b.c", then resource name is "a.b"
		fileName: fileName = function( moduleId ) {
			return rFileName.exec( moduleId )[1];
		},

		//define a module
		//dependencies is optional
		//load is the code of the module
		define: function( moduleId, dependencies, load, unload ) {

			if ($.isFunction( dependencies )) {
				unload = load;
				load = dependencies;
				dependencies = null;
			}

			var promise = accessPromise( moduleId );
			if (!promise) {
				//this is the case when matrix.provide is call in a static loaded js
				var defer = $.Deferred();
				promise = defer.promise();
				promise.defer = defer;
				accessPromise( moduleId, promise );
			}

			//introduce dontReoslve flag telling the consumer don't resolve it
			//as it will be taken care inside importCode,
			promise.defer.dontResolve = true;

			if (dependencies) {
				require( moduleId, dependencies );
				return matrix( dependencies ).done(
					function() {
						defineModule( moduleId, load, unload );
					}
				);
			} else {
				defineModule( moduleId, load, unload );
			}
		},

		done: function( fn, remove ) {
			if (remove) {
				loadCallbacks.remove( fn );
			} else {
				loadCallbacks.push( fn );
			}
		},

		fail: function( fn, remove ) {
			if (remove) {
				failCallbacks.remove( fn );
			} else {
				failCallbacks.push( fn );
			}
		},

		defaultLoader: "js"
	} );

	function reload( moduleId, change ) {

		var oldPromiseCache = $.extend( true, {}, promiseStore );
		matrix.unload( moduleId, true );
		change && change();
		return matrix( moduleId ).done( function() {
			for (var key in oldPromiseCache) {
				if (promiseStore[key] && oldPromiseCache[key]) {
					promiseStore[key].refCount = oldPromiseCache[key].refCount;
					promiseStore[key].url = oldPromiseCache[key].url;
					promiseStore[key].moduleId = oldPromiseCache[key].moduleId;
				}
			}
		} );
	}

	function getNewStaticDependencies( moduleId, dependencieToSet ) {
		var rtn,
			loader = findLoader( moduleId ),
			dynamicDependencies = loader && loader.require && loader.require( moduleId );

		if (dynamicDependencies) {
			rtn = [];
			dynamicDependencies = splitByComma( dynamicDependencies );
			dependencieToSet = splitByComma( dependencieToSet );
			for (var i = 0; i < dependencieToSet.length; i++) {
				if (!dynamicDependencies.contains( dependencieToSet[i] )) {
					rtn.push( dependencieToSet[i] );
				}
			}
			return rtn.length ? rtn.join() : null;
		} else {
			return dependencieToSet;
		}
	}

	function isDependencisDifferent( dependencies1, dependencies2 ) {
		if ((dependencies1 && !dependencies2) ||
		    dependencies2 && !dependencies1) {
			return true;
		} else if (!dependencies1 && !dependencies2) {
			return false;
		}

		dependencies1 = splitByComma( dependencies1 ).sort();
		dependencies2 = splitByComma( dependencies2 ).sort();
		if (dependencies1.length != dependencies2.length) {
			return true;
		}

		for (var i = 0; i < dependencies1.length; i++) {
			if (dependencies1[i] != dependencies2[i]) {
				return true;
			}
		}

		return false;
	}

	function findLoader( moduleId ) {
		var loaderName, i;
		for (i = loaderFinders.length - 1; i >= 0; i--) {
			loaderName = loaderFinders[i]( moduleId );
			if (loaderName) {
				break;
			}
		}
		loaderName = loaderName || matrix.defaultLoader;
		return loaderStore[loaderName];
	}

	//unload is optional
	//you can specify unload method in the code function
	//like matrix.unload(moduleId, fn);
	function defineModule( moduleId, load, unload ) {
		var promise = accessPromise( moduleId ),
			defer = promise.defer;
		delete promise.defer;
		promise.unload = unload;
		defer && defer.resolve( moduleId, load() );
	}

	function attachCommand( loader, commandName ) {
		var value;
		if (typeof loader[commandName] == "string" &&
		    (value = loaderCommands[commandName][loader[commandName]])) {
			loader[commandName] = value;
		}
	}

	function attachFilter( filters, filterName ) {
		if (typeof filters[filterName] == "string") {
			filters[filterName] = loadFilters[filterName][filters[filterName]];
		}
	}

	//#debug
	matrix.debug = {
		fullUrl: fullUrl,
		urlStore: urlStore,
		promiseStore: promiseStore,
		loaderStore: loaderStore,
		findLoader: findLoader,
		addHash: addHash,
		removeHash: removeHash,
		log: function( msg ) {
			var console = window.console;
			console && console.log && console.log( msg );
		},

		//this is for debugging purpose only
		moduleCounters: accessPromise,

		getLoaderByName: function( loaderName ) {
			return loaderName ? loaderStore[loaderName] : loaderStore;
		}
	};
	//#end_debug

//the following defined four built-in adapters( js0, js, cs0, css, module, adapter )
//

	//#debug
	var loaderCommands = matrix.loader.commands;
	var loadFilters = matrix.loader.loadFilters;
	var findLoader = matrix.debug.findLoader;
	var fullUrl = matrix.debug.fullUrl;
	var removeHash = matrix.debug.removeHash;
	//#end_debug

	var addLoader = matrix.loader.set,

	//if yo have code like the following in javascript,
	//the part delete window.depend2 will be extracted
	/* <@unload>
	 delete window.depend2;
	 </@unload>
	 */
		runloadStatement = /<@unload>([\w\W]+?)<\/@unload>/i,

	//match string "ref2, ref1" in
	/* <@require>
	 ref2, ref1
	 <@require>
	 */
		rDependHeader = /<@require>([\w\W]+?)<\/@require>/i;

	$.extend( true, loaderCommands, {
		load: {
			cacheImage: function( moduleId ) {
				var defer = $.Deferred(),
					promise = defer.promise(),
					url = matrix.url( moduleId );

				var img = new Image();
				img = new Image();
				img.onload = function() {
					defer.resolve( moduleId, url );
				};
				img.onerror = function() {
					defer.reject( moduleId, url );
				};
				img.src = url;
				return promise;
			}

		},
		unload: {
			removeCssLinkTag: function( moduleId ) {
				var url = fullUrl( matrix.url( moduleId ) );
				$( "link" ).filter(
					function() {
						return this.href === url && $( this ).attr( 'loadedByMatrix' );
					} ).remove();
			}
		},
		url: {
			moduleId: function( moduleId ) {
				return moduleId;
			},
			//this url expect module is put into its folder under baseUrl
			//if the loader name is "app", we should put the resource file into
			//baseUrl/app folder
			folder: function( moduleId ) {

				var fileExt = findLoader( moduleId ).fileExt,
					fileName = fileExt ? matrix.fileName( moduleId ) + "." + fileExt :
						moduleId,
					loaderName = matrix.fileExt( moduleId );

				return loaderName + "/" + fileName;
			}
		}
	} );

	function linkCss( moduleId ) {
		$( "<link href='" + matrix.url( moduleId ) + "' " + "rel='stylesheet' type='text/css' loadedByMatrix='1' />" ).appendTo( "head" );
	}

	$.extend( true, loadFilters, {

		staticLoaded: {
			returnFalse: function() {
				return false;
			},

			hasScriptTag: function( moduleId ) {
				return !!($( "script" ).filter(
					function() {
						return removeHash( this.src ) === removeHash( matrix.url( moduleId ) );
					} ).length);
			},

			hasCssLinkTag: function( moduleId ) {
				return !!($( "link" ).filter(
					function() {
						return removeHash( this.href ) === removeHash( matrix.url( moduleId ) ) && !$( this ).attr( 'loadedByMatrix' );
					} ).length);
			}
		},

		getSource: {
			//this is default getSource method
			getTextByAjax: function( moduleId ) {
				return $.ajax( {
					url: matrix.url( moduleId ),
					dataType: "text",
					cache: true
				} );
			}
		},

		compile: {
			globalEval: function( moduleId, sourceCode ) {
				return $.globalEval( sourceCode );
			},
			localEval: function( moduleId, sourceCode ) {
				return eval( sourceCode );
			},
			linkCss: linkCss
		},

		crossSiteLoad: {
			//can not use $.getScript directly, as matrix.resolve
			getScript: function( moduleId ) {
				var defer = $.Deferred(),
					promise = defer.promise();

				promise.defer = defer;

				$.getScript( matrix.url( moduleId ) ).then(
					function() {
						setTimeout( function() {
							if (!defer.dontResolve) {
								defer.resolve( moduleId );
								delete promise.defer;
							}
						}, 5 );
					},
					function() {
						defer.reject( moduleId );
						delete promise.defer;
					} );

				return promise;
			},

			linkCss: linkCss
		},
		buildUnload: {
			parseUnloadTag: function( sourceCode ) {
				var unloadStatements = runloadStatement.exec( sourceCode );
				return unloadStatements &&
				       unloadStatements[1] &&
				       new Function( unloadStatements[1] );
			}
		},
		buildDependencies: {
			parseRequireTag: function( moduleId, sourceCode ) {
				var require = rDependHeader.exec( sourceCode );
				return (require && require[1] ) || null;
			}
		}
	} );

	//a special module which is a package of modules, like a container
	addLoader( "pack", {
		load: matrix.loader.resolveDependencies( $.noop ),
		url: "moduleId"
	} );

	//js adapter try to parse the content of js file
	addLoader( "js", {
		load: {
			//the following are by default
			staticLoaded: "hasScriptTag"
			//crossSiteLoad: "getScript",
			//getSource: "getTextByAjax",
			//compile: "globalEval",
			//buildDependencies: "parseRequireTag",
			//buildUnload: "parseUnloadTag"
		},
		//this is necessary because if you have a sub loader inherits from
		//from this, and you don't want to inherited sub loader to specify this again
		fileExt: "js"
	} );

	addLoader( "loader", "js", {
		url: "folder"
	} );

	//css adapter tries to parse the content of css file
	addLoader( "css", {
		load: {
			staticLoaded: "hasCssLinkTag",
			crossSiteLoad: "linkCss",
			compile: "linkCss",
			buildDependencies: "parseRequireTag"
		},
		unload: "removeCssLinkTag",
		fileExt: "css"
	} );

	addLoader( "image", {
		load: "cacheImage",
		noRefCount: true
	} );

	//make img linker can handle module with these file extension
	matrix.loader.mapFileExtsToLoader( "jpg,png,bmp,gif", "image" );
	//fred test

//<@depends>subscription.js, model.js, declarative.js, template.js</@depends>
//



	template.load = function( templateId ) {
		return matrix( templateId.endsWith( ".html" ) ? templateId : templateId + ".template" );
	};

	matrix.loader.set( "template", {

		load: {
			compile: function( moduleId, sourceCode ) {

				$( sourceCode ).filter( "script[id]" ).each( function() {

					var $sourceCodeContainer = $( this );

					template.compile(
						this.id,
						$sourceCodeContainer.html(),
						$sourceCodeContainer.attr( "type" ) || template.defaultEngine );
				} );
			},
			buildDependencies: "parseDependsTag"
		},

		url: function( templateId ) {
			//first truncate the ".template" in the templateId, and get the real templateId
			return template.templateIdToUrl( matrix.fileName( templateId ) );
		}
	} );

	matrix.loader.set( "html", {
		load: {
			compile: function( moduleId, sourceCode ) {
				return template.compile( moduleId, sourceCode, template.defaultEngine );
			}
		}
	} );

	//~ is the base url of matrix resource
	//a -->     ~template/a/main.html
	//a.b -->   ~template/a/b.html
	//a.b.c --> ~template/a/b.html
	//
	//if id starts with "*", it is called share template
	//shared template id is like fileName.remainingPart
	//
	//*a --> ~template/_/a.html
	//*a.b --> ~template/_/a.html
	//*a.b.c --> ~template/_/a.html
	template.templateIdToUrl = function( templateId ) {

		var idSegments, folderName, fileName;

		if (templateId.startsWith( "*" )) {
			templateId = templateId.substr( 1 );
			//
			idSegments = templateId.split( "." );
			folderName = "_";
			fileName = idSegments[0];

		} else {

			idSegments = templateId.split( "." );
			folderName = idSegments[0];
			fileName = idSegments[1] || "main";

		}

		return "template/" + folderName + "/" + fileName + ".html";
	};

//<@depends>subscription.js, model.js, declarative.js, template.js</@depends>


	//the convention here is that ,
	// use rowView for the row in view
	//use item for the item in model array

	hm.workflowType( {

		//----------workflow type which modify row in list view-----------

		//!afterCreate.1:array|*addRowView;
		addRowView: newTemplateWorkflow(

			//the reason to use getOriginal is that
			//the subscription is the items array
			//but here we want to the elem
			"*getOriginal",

			function( rowView, e ) {

				var rowContainer = this,
					rows = rowContainer.children();

				if (rows.length === 0) {

					rowContainer.append( rowView );

				} else {

					//the insert may not happen at the end of the array
					//at can be insert in the middle, so
					//we can not simply do subscriber.append()
					//we need to append the row view at the index
					var index = +e.originalPublisher.pathIndex();

					//row zero is special, need to use before method
					if (index === 0) {

						rows.eq( 0 ).before( rowView );
					} else {
						rows.eq( index - 1 ).after( rowView );
					}
				}
			}
		),

		//!afterUpdate.1:array|*updateRowView
		updateRowView: newTemplateWorkflow(

			"*getOriginal",

			function( value, e ) {
				this.children().eq( +e.originalPublisher.pathIndex() ).replaceWith( value );
			} ),

		//!afterDel.1:array|*removeRowView;
		removeRowView: function( e ) {
			this.children().eq( +e.originalPublisher.pathIndex() ).remove();
		}


	} );

	//autoQuery means user don't need to trigger search button
	//query result will automatically updated when
	//query change, by default it is false
	//which means user has refreshQuery manually
	hmFn.initQueryable = function( autoQuery ) {

		if (this.get( "*query" )) {
			return this;
		}

		var queryable,
			query,
			sort,
			pager,
			filterFn,
			filter,
			items = this.get(),
			queryNode = this.cd( "*query" ),
			queryResultNode = this.cd( "*queryResult" ),
			hasQueryResultNode = this.cd( "*hasQueryResult" ),
			pagerNode = queryNode.cd( "pager" ),
			filterNode = queryNode.cd( "filter" ),
			filterEnabledNode = filterNode.cd( "enabled" ),
			sortNode = queryNode.cd( "sort" );

		autoQuery = !!autoQuery;

		if (autoQuery) {
			//items*queryResult ---referencing--> items*query
			queryResultNode.reference( queryNode.path );
		}

		//items*queryResult --> items
		queryResultNode.reference( this.path );

		this.extend(
			"*",
			queryable = {

				//if it is true, refreshQuery is bypassed
				autoQuery: autoQuery,

				hasQueryResult: false,

				//the object holding the data about paging, sorting, and filtering
				query: query = {
					pager: pager = {
						enabled: false,
						index: 0, //nth page
						count: 1,
						size: 0
					},
					sort: sort = {
						by: null, //currently we only support sort by one column sort
						asc: null
					},
					filter: filter = {
						by: "",
						value: "",
						ops: "",
						enabled: false
					},
					//is query enabled
					enabled: function() {
						return this.get( "pager.enabled" ) || this.get( "sort.by" ) || this.get( "filter.enabled" );
					}
				},

				queryResult: function( disablePaging ) {

					//"this" refers to the queryable node but not the queryable object
					var $items = $( items ),

					//run filter
						rtn = filterFn ? $items.filter( filterFn ).get() : $items.get();

					hasQueryResultNode.update( rtn.length > 0 );

					//run sort
					if (sort.by) {

						rtn.sortObject( sort.by, sort.asc );
					}

					//run paging
					if (!disablePaging && pager.enabled) {
						var count = Math.ceil( rtn.length / pager.size ) || 1;
						if (count != pager.count) {
							pager.count = count;
							if (pager.index > pager.count - 1) {
								pager.index = 0;
							}
							//
							queryNode.triggerChange( "pager" );
						}
						rtn = rtn.slice( pager.index * pager.size, (pager.index + 1) * pager.size );
					}

					return rtn;
				},

				// refreshQuery can be called via queryable.refreshQuery()
				//or it can be called via node like items*refreshQuery
				//
				// refreshQuery can be called regardless whether autoQuery is enabled,
				// because internally it check the flag to determine if
				// it is necessary to trigger the change event
				refreshQuery: function() {
					//if autoQuery is true, then don't need to trigger change again
					if (!queryable.autoQuery) {
						setTimeout( function() {
							queryResultNode.trigger( "afterUpdate" );
						}, 0 );
					}
				},

				paging: function( e ) {

					var index = e.eventData;

					if (rDigit.test( index )) {

						index = +index;

					} else {

						if (index == "next") {

							index = pager.index + 1;

						} else if (index == "previous") {

							index = pager.index - 1;

						} else if (index == "first") {

							index = 0;

						} else if (index == "last") {

							index = pager.count - 1;

						} else if (index == "disabled") {
							index = 0;
							queryable.resetPaging();
						}
					}

					if (typeof index !== "number" || index < 0 || index > pager.count - 1) {
						index = 0;
					}

					pagerNode.update( "index", index );
					queryable.refreshQuery();
				},

				resetSort: function( triggerByMasterReset ) {
					sortNode.set( "by", null )
						.set( "asc", null );

					if (triggerByMasterReset !== true) {
						queryable.refreshQuery();
					}
				},

				resetSearch: function( triggerByMasterReset ) {
					filterNode.update( "by", "" )
						.update( "value", "" )
						.update( "ops", "" );

					if (triggerByMasterReset !== true) {
						queryable.refreshQuery();
					}

				},

				resetPaging: function( triggerByMasterReset ) {
					pagerNode.update( "enabled", false )
						.update( "size", 0 )
						.update( "count", 1 )
						.update( "index", 0 );

					if (triggerByMasterReset !== true) {
						queryable.refreshQuery();
					}

				},

				resetQuery: function() {
					queryable.resetSort( true );
					queryable.resetSearch( true );
					queryable.resetPaging( true );
					queryable.refreshQuery();
				}
			}
		);

		function buildFilterFn( e ) {
			var ops = filter.ops,
				by = filter.by,
				value = filter.value,
				regex;

			if (value) {

				if (!ops) {
					//by default it s contains
					regex = RegExp( value, "i" );

				} else if (ops == "equals") {

					regex = RegExp( "^" + value + "$", "i" );

				} else {

					throw "operator does not supported";
				}

				filterFn = (by) ?
					function() {
						return regex.test( this[by] );
					} :
					function() {
						if (isObject( this )) {
							for (var key in this) {
								if (regex.test( this[key] )) {
									return true;
								}
							}
							return false;
						} else {
							return regex.test( this );
						}
					};

				filterEnabledNode.set( true );
				queryable.refreshQuery();
			} else {
				if (filterFn) {
					filterFn = null;
					filterEnabledNode.set( false );
					queryable.refreshQuery();
				}
			}
		}

		filterNode.cd( "by" ).handle( "afterUpdate", buildFilterFn );
		filterNode.cd( "value" ).handle( "afterUpdate", buildFilterFn );
		filterNode.cd( "ops" ).handle( "afterUpdate", buildFilterFn );
		return this;
	};

	hm.behavior( {

		//listView:arrayPath|rowTemplateId
		//
		listView: //

		//subscription from view
			"includeOnSelfChange:.;" +
				//render newly appended data item by appending it to end of the view
			"!afterCreate.1:.|*addRowView;" +
				//render the updated data item in the view
			"!afterUpdate.1:.|*updateRowView;" +
				//delete the deleted data item in the view
			"!afterDel.1:.|*removeRowView",

		initQueryable: function( elem, path, elemBehavior, options ) {
			hm( path ).initQueryable( !!options );
		},

		//render the whole list of items
		//queryView:items
		queryView: "includeOnAnyChange:*queryResult",

		//sort:items|firstName
		sortQueryButton: "$click:*query.sort.by|*hardCode;" +
		                 "$click:*query.sort.asc|*toggle;" +
		                 "$click:*refreshQuery",

		//resetSortButton:items
		resetSortButton: "$click:*resetSort;" +
		                 "show:*query.sort.by",

		//searchButton:items
		searchButton: "$click:*refreshQuery;" +
		              "enable:*query.filter.enabled",

		resetSearchButton: "$click:*resetSearch;" +
		                   "show:*query.filter.enabled",

		resetQueryButton: "$click:*resetQuery;" +
		                  "show:*query.enabled",

		searchBox: "ns:*query.filter.value;" +
		           "val:.|enter;" +
		           "$esc:.|*null",

		//pager:items|#pagerTemplate
		pager: "includeOnAnyChange:*query.pager;" + //render pager using the data under items*query.pager
		       "show:*hasQueryResult|_;" +
		       "$paging:*paging;" +
		       "preventDefault:.",

		setPageButton: "true:*query.pager.enabled;" +
		               "enable:*query.pager.size;" +
		               "$click:*refreshQuery",

		//path is ignore, does not create any subscription
		page: function( elem, path, elemBehavior, pageIndex ) {
			if (!pageIndex) {
				throw "pageIndex is missing";
			}
			$( elem ).mapEvent( "click", "paging", pageIndex );
		},

		showFound: "show:*hasQueryResult",

		hideFound: "hide:*hasQueryResult"
	} );



//
/*
 <@depends>
 subscription.js,
 model.js
 </@depends>
 */


	//create a table with some seeds
	function createTable( seeds ) {
		if (isUndefined( seeds )) {
			seeds = [];
		} else if (!isArray( seeds )) {
			seeds = [seeds];
		}

		if (seeds.table && seeds.guid) {
			return seeds;
		}

		seeds.table = {};
		seeds.guid = 0;
		return seeds;
	}

	function handleArrayNodeUpdateDescendant( e ) {

		var table,
			publisher = e.publisher;

		if (e.level === 1) {
			table = publisher.get().table;

			//the event is caused by updating to the an item if the array
			for (var key in table) {
				if (table[key] == e.removed) {
					this.set( key, e.proposed );
					break;
				}
			}

		} else if (e.level >= 2) {

			var originalPath = e.originalPublisher.path,
				path = publisher.path,
				remaining = originalPath.substr( path.length + 1 ),
				index = remaining.substr( 0, remaining.indexOf( "." ) );

			if ($.isNumeric( index )) {


				//e.g contacts.1.firstName is updated
				//index == 1
				//itemKey = c1

				var itemKey = publisher.keyAt( index ),
					fullPathOfKeyItem = "table." + itemKey + remaining.substr( remaining.indexOf( "." ) );

				//subPath == table.c1.firstName
				publisher.trigger( fullPathOfKeyItem, "afterUpdate", e.proposed, e.removed );
			}
		}
	}

	function handleArrayNodeCreateChild( e ) {
		this.set( "c" + e.publisher.get().guid++, e.proposed );
	}

	function handleArrayNodeDeleteChild( e ) {
		var table = this.get(),
			removed = e.removed;

		for (var key in table) {
			if (table[key] === removed) {
				this.del( key );
				break;
			}
		}
	}

	function handleTableNodeDeleteChild( e ) {
		this.removeItem( e.removed );
	}

	function handleTableNodeUpdateChild( e ) {
		this.replaceItem( e.removed, e.proposed );
	}

	//			onAddOrUpdateHandlers[i]( contextPath, indexPath, modelValue );
	hm.onAddOrUpdateNode( function( context, index, array ) {

		if (!isArray( array )) {
			return;
		}

		var table = createTable( array ).table;

		for (var i = 0; i < array.length; i++) {
			table["c" + array.guid++] = array[i];
		}

		var arrayNode = hm( context ).cd( index ),
			tableNode = arrayNode.cd( "table" );

		//when item is inserted in array, insert the item in table
		tableNode.sub( arrayNode, "afterCreate.1", handleArrayNodeCreateChild );

		//when item is updated in itemsNode, update the item in table
		tableNode.sub( arrayNode, "afterUpdate.*", handleArrayNodeUpdateDescendant );

		//when item deleted in array, delete the item in hash table
		tableNode.sub( arrayNode, "afterDel.1", handleArrayNodeDeleteChild );

		//when item is deleted in table, delete the item in array
		arrayNode.sub( tableNode, "afterDel.1", handleTableNodeDeleteChild );

		//when item is updated in table, update the item in array
		arrayNode.sub( tableNode, "afterUpdate.1", handleTableNodeUpdateChild );

	} );

	hmFn.itemKey = function( item ) {
		var key,
			table,
			array = this.raw();

		if (isFunction( array )) {
			array = this.main().get();
		}
		table = array.table;

		if (table) {
			for (key in table) {
				if (item === table[key]) {
					return key;
				}
			}
		}
	};

	hmFn.keyAt = function( index ) {
		return this.itemKey( this.get( index ) );
	};


//
//<@depends>subscription.js, model.js, declarative.js, template.js</@depends>


	//augment jQuery Event type
	//when you attach a workflow to parent element to handle the event from children
	//we want to know the children element's row index of all the rows
	$.Event.prototype.selectedRowIndex = function() {
		return this.publisher.children().filter( this.originalPublisher.parents() ).index();
	};

	function EditObject( index ) {
		this.selectedIndex = index;
	}

	EditObject.prototype = {
		item: null,
		//logically mode depends on "item" and "index"
		//but here we disable these dependencies, because we want to
		//manually trigger the events
		//if it really depends them, the events will be hard to controlled
		mode: function __() {
			var edit = this.get(),
				item = edit.item,
				selectedIndex = edit.selectedIndex;

			return item === null ? "read" :
				isUndefined( selectedIndex ) ? "update" :
					(selectedIndex == -1) ? "new" :
						"update";

		}
	};

	//the follow methods are designed to be used with array model
	// they are used to manipulate the shadow edit object of array model
	extend( hmFn, {

		//initShadowEdit is required for array model or for array query functions
		//it is not necessary for model of other type
		initShadowEdit: function( itemTemplate ) {
			//it is a convention that, if the path of list data is items
			//we take items_itemTemplate as template from new item for the list data

			var model = this;

			if (model.get( "*edit" )) {
				return;
			}
			var itemsPath = model.path,
				rChildShadowItem = RegExp( "^" + itemsPath.replace( ".", "\\." ) + "\\*edit\\.item[^*]+\\*$" ),
				rDeepShadowItem = RegExp( "^" + itemsPath.replace( ".", "\\." ) + "\\*edit\\.item[\\w.]+\\*edit\\.item" );

			if (isUndefined( itemTemplate )) {

				if (model.isShadow() && !isFunction( model.raw() )) {
					//if the array object items is already in shadow
					//the itemTemplate is already defined in main items' itemTemplate
					//for example
					//the itemsPath is "doc.entries*edit.item.personal.signatures"
					//the itemTemplate is defined in "doc.entries*edit.item.personal.signatures.0"
					//the following is try to get the itemTemplate
					//
					//the mainModel is doc.entries
					var mainModel = model.main();

					//the editingModelPath of mainModel is doc.entries*edit.item
					var editingModelPath = mainModel.logicalPath() + "*edit.item";

					//the position of last "." in "doc.entries*edit.item."
					var startIndex = editingModelPath.length + 1;

					//the portion of "personal.signatures" in "doc.entries*edit.item.personal.signatures"
					var subPath = toLogicalPath( itemsPath ).substr( startIndex );

					//get "doc.entries*edit.itemTemplate.personal.signatures.0"
					itemTemplate = clone( mainModel.get( "*edit.itemTemplate." + subPath + ".0" ), true );

				} else {

					//the convention is that if we have model at path "contacts",
					//the template item is expected at "contacts_itemTemplate"
					if (isFunction( model.raw() )) {
						itemTemplate = rootNode.raw( model.main().path + "_itemTemplate" );
					} else {
						itemTemplate = rootNode.raw( itemsPath + "_itemTemplate" );
					}

					//if convention is not followed, use the existing as template
					if (isUndefined( itemTemplate )) {
						itemTemplate = clearObj( clone( model.get()[0], true ) );
					}
				}
			}

			var editObject = new EditObject( -1 );
			editObject.itemTemplate = itemTemplate;
			editObject.item = null;

			model.set( "*edit", editObject );

			//we want to trigger beginInRowUpdate/cancelInRowUpdate after selectedIndex has changed
			//because the handlers depends on the availability of selectedIndex
			model.cd( "*edit.selectedIndex" ).handle( "afterUpdate", function( e ) {

				var newIndex = e.proposed,
					oldIndex = e.removed;

				if (newIndex >= 0) {

					model.trigger( "beginInRowUpdate", newIndex );

				} else if (newIndex == -1) {

					model.trigger( "cancelInRowUpdate", oldIndex );
				}
			} );

			model.cd( "*edit.item" ).handle( "afterUpdate", function( e ) {
				var key, logicalPath, editObject;

				for (key in shadowRoot) {

					logicalPath = util.toLogicalPath( "__hm." + key );

					if (rDeepShadowItem.test( logicalPath )) {

						delete shadowRoot[key];

					} else if (rChildShadowItem.test( logicalPath )) {

						editObject = shadowRoot[key].edit;

						if (editObject) {
							editObject.item = null;
							editObject.selectedIndex = -1;
						}
					}
				}
			} );
			return this;
		},

		//create a new item in shadow edit object for items model
		//not necessary for model of primitive type and objects
		newShadowItem: function() {
			if (this.get( "*edit.mode" ) !== "read") {
				this.resetShadowItem();
			}

			var editShadowModel = this.cd( "*edit" ),
				itemTemplate = editShadowModel.raw( "itemTemplate" ),
				item = (isFunction( itemTemplate )) ?
					itemTemplate() :
					clone( itemTemplate, true );

			editShadowModel.update( "item", item );
			editShadowModel.triggerChange( "mode" );
		},

		editShadowItem: function( item, itemIndex ) {

			var itemValue = this.raw();
			if (isPrimitive( itemValue ) || isObject( itemValue )) {

				var edit = this.get( "*edit" );
				if (isUndefined( edit )) {
					edit = new EditObject();
					this.set( "*edit", edit );
				}

				if (edit.item !== null) {
					return;
				}

				this.set( "*edit.item", clone( itemValue, true ) );
				this.triggerChange( "*edit.mode" );

			} else {

				if (this.get( "*edit.mode" ) !== "read") {
					this.resetShadowItem();
				}

				if (isUndefined( itemIndex )) {
					itemIndex = this.indexOf( item );
				} else {
					item = this.get()[itemIndex];
				}

				var editShadowModel = this.cd( "*edit" ),
					itemTemplate = editShadowModel.raw( "itemTemplate" ),
					copy = (isFunction( itemTemplate )) ?
						itemTemplate( item ) :
						clone( item, true );

				editShadowModel.update( "item", copy )
					.update( "selectedIndex", itemIndex );

				editShadowModel.triggerChange( "mode" );
			}

		},

		resetShadowItem: function( save ) {
			if (this.path.endsWith( ".edit.item" )) {
				return this.main().resetShadowItem();
			}

			var items = this.raw();
			if (isPrimitive( items ) || isObject( items )) {

				this.set( "*edit.item", null );
				this.triggerChange( "*edit.mode" );

			} else {

				var edit = this.cd( "*edit" );
				if (!isUndefined( edit.get() )) {

					edit.update( "item", null );

					if (save) {
						//if it triggered by saveShadowItem
						//update selectedIndex directly to avoid events
						edit.get().selectedIndex = -1;
					} else {
						edit.update( "selectedIndex", -1 );
					}

					edit.triggerChange( "mode" );
				}
			}

		},

		saveShadowItem: function() {

			if (this.path.endsWith( ".edit.item" )) {
				return this.main().saveShadowItem();
			}

			var items = this.raw();

			if (isPrimitive( items ) || isObject( items )) {

				this.set( this.get( "*edit.item" ) )
					.set( "*edit.item", null );

				this.triggerChange( "*edit.mode" );

			} else {

				var currentEditMode = this.get( "*edit.mode" ),
					pendingItem = this.get( "*edit.item" );

				if (currentEditMode == "read") {

					throw "invalid operations";

				} else if (currentEditMode == "new") {

					if (isFunction( items )) {
						//this is case when items is model*queryResult
						this.main().push( pendingItem );

					} else {
						this.push( pendingItem );
					}

					this.resetShadowItem();

				} else /*if (currentEditMode == "update")*/ {

					var selectedIndex = this.get( "*edit.selectedIndex" );

					if (isFunction( items )) {
						//this is case when items is model*queryResult
						items = this.get();
						this.main().replaceItem(
							items[selectedIndex],
							pendingItem
						);
					} else {
						this.replaceItem(
							items[selectedIndex],
							pendingItem
						);
					}
					this.resetShadowItem( true );
				}

			}
		}
	} );

	hm.workflowType( {

		//------workflows that modify model------

		//$click:items|*editShadowItem
		//$click:items*queryResult|*editShadowItem
		newShadowItem: "*fakeGet newShadowItem",

		//$click:item|*editShadowItem
		//$editRow:items|*editShadowItem
		//$editRow:items*queryResult|*editShadowItem
		editShadowItem: function( e ) {
			if (e.type == "editRow") {
				//this trigger by edit button
				this.editShadowItem( null, e.selectedRowIndex() );
			} else {
				if (this.path.endsWith( ".edit.item" )) {
					this.main().editShadowItem( this.get() );
				} else {
					this.editShadowItem();
				}
			}
			e.stopPropagation();
		},

		//"$delete:items|*removeItem;"
		//"$delete:items*queryResult|*removeItem;"
		removeItem: function( e ) {
			if (this.get( "*edit.mode" ) != "read") {
				this.resetShadowItem();
			}
			var index = e.selectedRowIndex();
			var items = this.raw();
			if (isFunction( items )) {
				//this is case when items is model*queryResult
				items = this.get();
				this.main().removeItem( items[index] );
			} else {
				this.removeAt( index );
			}
			e.stopPropagation();
		},

		//$moveUp:items|*moveUpItem;
		moveUpItem: function( e ) {
			var selectedIndex = e.selectedRowIndex();
			this.move( selectedIndex, selectedIndex - 1 );
			e.stopPropagation();
		},

		//$moveUp:items|*moveUpItem;
		moveDownItem: function( e ) {
			var selectedIndex = e.selectedRowIndex();
			this.move( selectedIndex, selectedIndex + 1 );
			e.stopPropagation();
		},

		//------workflows that modify views------

		//!afterUpdate:items*edit.mode|*renderNewView;
		//!afterUpdate:items*queryResult*edit.mode|*renderNewView;
		renderNewView: newTemplateWorkflow(
			function( e ) {
				if (e.publisher.get() == "new") {
					return e.publisher.main().get( "*edit.item" );
				}
			}
			/*set activity is by default html*/

		),

		//"!beginInRowUpdate:items|*renderUpdateRowView;"
		//"!beginInRowUpdate:items*queryResult|*renderUpdateRowView;"
		renderUpdateRowView: newTemplateWorkflow(
			//get activity
			function( e ) {
				return e.publisher.get( "*edit.item" );
			},
			//set activity
			function( value, e ) {
				//e.proposed is the index of the edit item
				this.children().eq( e.proposed ).replaceWith( value );
			} ),

		//"!beginInRowUpdate:items|*renderUpdateRowView;"
		//"!beginInRowUpdate:items*queryResult|*renderUpdateRowView;"
		destroyUpdateRowView: function( e ) {
			e.publisher.triggerChange( e.proposed );
		},

		//$click:items*edit.item|*saveShadowItem;
		//$click:items*queryResult*edit.item|*saveShadowItem;
		saveShadowItem: function( e ) {
			this.saveShadowItem();
			e.stopPropagation();
		},

		//$click:items*edit.item|*resetShadowItem;
		//$click:items*queryResult*edit.item|*resetShadowItem;
		resetShadowItem: function( e ) {
			this.resetShadowItem();
			e.stopPropagation();
		}
	} );

	hm.behavior( {


		// shadowEdit:items|rowTemplateId or
		// shadowEdit:items*queryResult|rowTemplateId
		shadowEdit: "!init:.|initShadowEdit *fakeSet;" +
		            "deleteRow:.;" +
		            "$editRow:.|*editShadowItem",

		// shadowEditInRow:items|updateRowTemplateId or
		// shadowEditInRow:items*queryResult|updateRowTemplateId
		shadowEditInRow: "shadowEdit:.;" +
		                 "!beginInRowUpdate:.|*renderUpdateRowView;" +
		                 "!cancelInRowUpdate:.|*destroyUpdateRowView",

		deleteRow: "$deleteRow:.|*confirm|_Do you want to delete this item?;" +
		           "$deleteRow:.|*removeItem;",
		//movableRow:items
		movableRow: "$moveUp:.|*moveUpItem;" +
		            "$moveDown:.|*moveDownItem;",

		//newItemView:items
		//newItemView:items*queryResult
		newItemView: "!afterUpdate:*edit.mode|*renderNewView;" +
		             "showOnNew:.",

		//showOnNew:items
		//showOnNew:items*queryResult
		showOnNew: "show:*edit.mode|_new",

		//hideOnNew:items
		//hideOnNew:items*queryResult
		hideOnNew: "hide:*edit.mode|_new",

		//editItemView:items
		//editItemView:items*queryResult
		editItemView: "includeOnSelfChange:*edit.item;" +
		              "showOnEdit:.",

		displayItemView: "includeOnSelfChange:.;hideOnEdit:.",

		//showOnEdit:items
		//showOnEdit:items*queryResult
		//showOnEdit: "hide:*edit.mode|_read",
		showOnEdit: function( elem, path, elemBehavior, options ) {
			elemBehavior.appendSub( elem, path + "*edit.mode", "init afterUpdate", function( e ) {
				var mode = e.publisher.get();
				this[(isUndefined( mode ) || mode == "read") ? "hide" : "show"]();
			} );
		},

		//hideOnEdit:items
		//hideOnEdit:items*queryResult
		//hideOnEdit: "show:*edit.mode|_read",
		hideOnEdit: function( elem, path, elemBehavior, options ) {
			elemBehavior.appendSub( elem, path + "*edit.mode", "init afterUpdate", function( e ) {
				var mode = e.publisher.get();
				this[(isUndefined( mode ) || mode == "read") ? "show" : "hide"]();
			} );
		},

		//newItem:items
		//newItem:items*queryResult
		newItem: "$click:.|*newShadowItem;" +
		         "hideOnNew:.",

		//editButton:item
		//this is only used non-array item edit
		editObject: "$click:.|*editShadowItem;hideOnEdit:.",

		//saveButton:items*edit.item
		//saveButton:items*queryResult*edit.item
		saveButton: "$click:.|*saveShadowItem",

		//cancelSaveButton:items*edit.item
		//cancelSaveButton:items*queryResult*edit.item
		cancelSaveButton: "$click:.|*resetShadowItem"

	} );

	hm.newViewEvent( {

		editRow: ["click", function( e ) {
			return $( e.target ).hasClass( "editRow" );
		}],

		deleteRow: ["click", function( e ) {
			return $( e.target ).hasClass( "deleteRow" );

		}],

		moveUp: ["click", function( e ) {
			return $( e.target ).hasClass( "moveUp" );
		}],

		moveDown: ["click", function( e ) {
			return $( e.target ).hasClass( "moveDown" );
		}]
	} );

/*!
 * jQuery BBQ: Back Button & Query Library - v1.3pre - 8/26/2010
 * http://benalman.com/projects/jquery-bbq-plugin/
 * 
 * Copyright (c) 2010 "Cowboy" Ben Alman
 * Dual licensed under the MIT and GPL licenses.
 * http://benalman.com/about/license/
 */

// Script: jQuery BBQ: Back Button & Query Library
//
// *Version: 1.3pre, Last updated: 8/26/2010*
// 
// Project Home - http://benalman.com/projects/jquery-bbq-plugin/
// GitHub       - http://github.com/cowboy/jquery-bbq/
// Source       - http://github.com/cowboy/jquery-bbq/raw/master/jquery.ba-bbq.js
// (Minified)   - http://github.com/cowboy/jquery-bbq/raw/master/jquery.ba-bbq.min.js (2.2kb gzipped)
// 
// About: License
// 
// Copyright (c) 2010 "Cowboy" Ben Alman,
// Dual licensed under the MIT and GPL licenses.
// http://benalman.com/about/license/
// 
// About: Examples
// 
// These working examples, complete with fully commented code, illustrate a few
// ways in which this plugin can be used.
// 
// Basic AJAX     - http://benalman.com/code/projects/jquery-bbq/examples/fragment-basic/
// Advanced AJAX  - http://benalman.com/code/projects/jquery-bbq/examples/fragment-advanced/
// jQuery UI Tabs - http://benalman.com/code/projects/jquery-bbq/examples/fragment-jquery-ui-tabs/
// Deparam        - http://benalman.com/code/projects/jquery-bbq/examples/deparam/
// 
// About: Support and Testing
// 
// Information about what version or versions of jQuery this plugin has been
// tested with, what browsers it has been tested in, and where the unit tests
// reside (so you can test it yourself).
// 
// jQuery Versions - 1.2.6, 1.3.2, 1.4.1, 1.4.2
// Browsers Tested - Internet Explorer 6-8, Firefox 2-4, Chrome 5-6, Safari 3.2-5,
//                   Opera 9.6-10.60, iPhone 3.1, Android 1.6-2.2, BlackBerry 4.6-5.
// Unit Tests      - http://benalman.com/code/projects/jquery-bbq/unit/
// 
// About: Release History
// 
// 1.3pre - (8/26/2010) Integrated <jQuery hashchange event> v1.3, which adds
//         document.title and document.domain support in IE6/7, BlackBerry
//         support, better Iframe hiding for accessibility reasons, and the new
//         <jQuery.fn.hashchange> "shortcut" method. Added the
//         <jQuery.param.sorted> method which reduces the possibility of
//         extraneous hashchange event triggering. Added the
//         <jQuery.param.fragment.ajaxCrawlable> method which can be used to
//         enable Google "AJAX Crawlable mode."
// 1.2.1 - (2/17/2010) Actually fixed the stale window.location Safari bug from
//         <jQuery hashchange event> in BBQ, which was the main reason for the
//         previous release!
// 1.2   - (2/16/2010) Integrated <jQuery hashchange event> v1.2, which fixes a
//         Safari bug, the event can now be bound before DOM ready, and IE6/7
//         page should no longer scroll when the event is first bound. Also
//         added the <jQuery.param.fragment.noEscape> method, and reworked the
//         <hashchange event (BBQ)> internal "add" method to be compatible with
//         changes made to the jQuery 1.4.2 special events API.
// 1.1.1 - (1/22/2010) Integrated <jQuery hashchange event> v1.1, which fixes an
//         obscure IE8 EmulateIE7 meta tag compatibility mode bug.
// 1.1   - (1/9/2010) Broke out the jQuery BBQ event.special <hashchange event>
//         functionality into a separate plugin for users who want just the
//         basic event & back button support, without all the extra awesomeness
//         that BBQ provides. This plugin will be included as part of jQuery BBQ,
//         but also be available separately. See <jQuery hashchange event>
//         plugin for more information. Also added the <jQuery.bbq.removeState>
//         method and added additional <jQuery.deparam> examples.
// 1.0.3 - (12/2/2009) Fixed an issue in IE 6 where location.search and
//         location.hash would report incorrectly if the hash contained the ?
//         character. Also <jQuery.param.querystring> and <jQuery.param.fragment>
//         will no longer parse params out of a URL that doesn't contain ? or #,
//         respectively.
// 1.0.2 - (10/10/2009) Fixed an issue in IE 6/7 where the hidden IFRAME caused
//         a "This page contains both secure and nonsecure items." warning when
//         used on an https:// page.
// 1.0.1 - (10/7/2009) Fixed an issue in IE 8. Since both "IE7" and "IE8
//         Compatibility View" modes erroneously report that the browser
//         supports the native window.onhashchange event, a slightly more
//         robust test needed to be added.
// 1.0   - (10/2/2009) Initial release


	// Some convenient shortcuts.

	var decode = decodeURIComponent,

	// Method / object references.
		jq_param = $.param,
		jq_param_sorted,
		jq_param_fragment,
		jq_deparam,
		jq_deparam_fragment,
		jq_bbq = $.bbq = $.bbq || {},
		jq_bbq_pushState,
		jq_bbq_getState,
		jq_elemUrlAttr,
		special = $.event.special,

	// Reused strings.
		str_hashchange = 'hashchange',
		str_querystring = 'querystring',
		str_fragment = 'fragment',
		str_elemUrlAttr = 'elemUrlAttr',
		str_href = 'href',
		str_src = 'src',

	// Reused RegExp.
		re_params_querystring = /^.*\?|#.*$/g,
		re_params_fragment,
		re_fragment,
		re_no_escape,

		ajax_crawlable,
		fragment_prefix,

	// Used by jQuery.elemUrlAttr.
		elemUrlAttr_cache = {};

	// A few commonly used bits, broken out to help reduce minified file size.

	function is_string( arg ) {
		return typeof arg === 'string';
	}

	// Why write the same function twice? Let's curry! Mmmm, curry..

	function curry( func ) {
		var args = slice.call( arguments, 1 );

		return function() {
			return func.apply( this, args.concat( slice.call( arguments ) ) );
		};
	}

	// Get location.hash (or what you'd expect location.hash to be) sans any
	// leading #. Thanks for making this necessary, Firefox!
	function get_fragment2( url ) {
		return url.replace( re_fragment, '$2' );
	}

	// Get location.search (or what you'd expect location.search to be) sans any
	// leading #. Thanks for making this necessary, IE6!
	function get_querystring( url ) {
		return url.replace( /(?:^[^?#]*\?([^#]*).*$)?.*/, '$1' );
	}

	// Section: Param (to string)
	//
	// Method: jQuery.param.querystring
	//
	// Retrieve the query string from a URL or if no arguments are passed, the
	// current window.location.href.
	//
	// Usage:
	//
	// > jQuery.param.querystring( [ url ] );
	//
	// Arguments:
	//
	//  url - (String) A URL containing query string params to be parsed. If url
	//    is not passed, the current window.location.href is used.
	//
	// Returns:
	//
	//  (String) The parsed query string, with any leading "?" removed.
	//

	// Method: jQuery.param.querystring (build url)
	//
	// Merge a URL, with or without pre-existing query string params, plus any
	// object, params string or URL containing query string params into a new URL.
	//
	// Usage:
	//
	// > jQuery.param.querystring( url, params [, merge_mode ] );
	//
	// Arguments:
	//
	//  url - (String) A valid URL for params to be merged into. This URL may
	//    contain a query string and/or fragment (hash).
	//  params - (String) A params string or URL containing query string params to
	//    be merged into url.
	//  params - (Object) A params object to be merged into url.
	//  merge_mode - (Number) Merge behavior defaults to 0 if merge_mode is not
	//    specified, and is as-follows:
	//
	//    * 0: params in the params argument will override any query string
	//         params in url.
	//    * 1: any query string params in url will override params in the params
	//         argument.
	//    * 2: params argument will completely replace any query string in url.
	//
	// Returns:
	//
	//  (String) A URL with a urlencoded query string in the format '?a=b&c=d&e=f'.

	// Method: jQuery.param.fragment
	//
	// Retrieve the fragment (hash) from a URL or if no arguments are passed, the
	// current window.location.href.
	//
	// Usage:
	//
	// > jQuery.param.fragment( [ url ] );
	//
	// Arguments:
	//
	//  url - (String) A URL containing fragment (hash) params to be parsed. If
	//    url is not passed, the current window.location.href is used.
	//
	// Returns:
	//
	//  (String) The parsed fragment (hash) string, with any leading "#" removed.

	// Method: jQuery.param.fragment (build url)
	//
	// Merge a URL, with or without pre-existing fragment (hash) params, plus any
	// object, params string or URL containing fragment (hash) params into a new
	// URL.
	//
	// Usage:
	//
	// > jQuery.param.fragment( url, params [, merge_mode ] );
	//
	// Arguments:
	//
	//  url - (String) A valid URL for params to be merged into. This URL may
	//    contain a query string and/or fragment (hash).
	//  params - (String) A params string or URL containing fragment (hash) params
	//    to be merged into url.
	//  params - (Object) A params object to be merged into url.
	//  merge_mode - (Number) Merge behavior defaults to 0 if merge_mode is not
	//    specified, and is as-follows:
	//
	//    * 0: params in the params argument will override any fragment (hash)
	//         params in url.
	//    * 1: any fragment (hash) params in url will override params in the
	//         params argument.
	//    * 2: params argument will completely replace any query string in url.
	//
	// Returns:
	//
	//  (String) A URL with a urlencoded fragment (hash) in the format '#a=b&c=d&e=f'.

	function jq_param_sub( is_fragment, get_func, url, params, merge_mode ) {
		var result,
			qs,
			matches,
			url_params,
			hash;

		if (params !== undefined) {
			// Build URL by merging params into url string.

			// matches[1] = url part that precedes params, not including trailing ?/#
			// matches[2] = params, not including leading ?/#
			// matches[3] = if in 'querystring' mode, hash including leading #, otherwise ''
			matches = url.match( is_fragment ? re_fragment : /^([^#?]*)\??([^#]*)(#?.*)/ );

			// Get the hash if in 'querystring' mode, and it exists.
			hash = matches[3] || '';

			if (merge_mode === 2 && is_string( params )) {
				// If merge_mode is 2 and params is a string, merge the fragment / query
				// string into the URL wholesale, without converting it into an object.
				qs = params.replace( is_fragment ? re_params_fragment : re_params_querystring, '' );

			} else {
				// Convert relevant params in url to object.
				url_params = jq_deparam( matches[2] );

				params = is_string( params ) ?

					// Convert passed params string into object.
					jq_deparam[ is_fragment ? str_fragment : str_querystring ]( params )

					// Passed params object.
					: params;

				qs = merge_mode === 2 ? params                              // passed params replace url params
					: merge_mode === 1 ? $.extend( {}, params, url_params )  // url params override passed params
					: $.extend( {}, url_params, params );                     // passed params override url params

				// Convert params object into a sorted params string.
				qs = jq_param_sorted( qs );

				// Unescape characters specified via $.param.noEscape. Since only hash-
				// history users have requested this feature, it's only enabled for
				// fragment-related params strings.
				if (is_fragment) {
					qs = qs.replace( re_no_escape, decode );
				}
			}

			// Build URL from the base url, querystring and hash. In 'querystring'
			// mode, ? is only added if a query string exists. In 'fragment' mode, #
			// is always added.
			result = matches[1] + ( is_fragment ? fragment_prefix : qs || !matches[1] ? '?' : '' ) + qs + hash;

		} else {
			// If URL was passed in, parse params from URL string, otherwise parse
			// params from window.location.href.
			result = get_func( url !== undefined ? url : location.href );
		}

		return result;
	}

	jq_param[ str_querystring ] = curry( jq_param_sub, 0, get_querystring );
	jq_param[ str_fragment ] = jq_param_fragment = curry( jq_param_sub, 1, get_fragment2 );

	// Method: jQuery.param.sorted
	//
	// Returns a params string equivalent to that returned by the internal
	// jQuery.param method, but sorted, which makes it suitable for use as a
	// cache key.
	//
	// For example, in most browsers jQuery.param({z:1,a:2}) returns "z=1&a=2"
	// and jQuery.param({a:2,z:1}) returns "a=2&z=1". Even though both the
	// objects being serialized and the resulting params strings are equivalent,
	// if these params strings were set into the location.hash fragment
	// sequentially, the hashchange event would be triggered unnecessarily, since
	// the strings are different (even though the data described by them is the
	// same). By sorting the params string, unecessary hashchange event triggering
	// can be avoided.
	//
	// Usage:
	//
	// > jQuery.param.sorted( obj [, traditional ] );
	//
	// Arguments:
	//
	//  obj - (Object) An object to be serialized.
	//  traditional - (Boolean) Params deep/shallow serialization mode. See the
	//    documentation at http://api.jquery.com/jQuery.param/ for more detail.
	//
	// Returns:
	//
	//  (String) A sorted params string.

	jq_param.sorted = jq_param_sorted = function( a, traditional ) {
		var arr = [],
			obj = {};

		$.each( jq_param( a, traditional ).split( '&' ), function( i, v ) {
			var key = v.replace( /(?:%5B|=).*$/, '' ),
				key_obj = obj[ key ];

			if (!key_obj) {
				key_obj = obj[ key ] = [];
				arr.push( key );
			}

			key_obj.push( v );
		} );

		return $.map( arr.sort(),function( v ) {
			return obj[ v ];
		} ).join( '&' );
	};

	// Method: jQuery.param.fragment.noEscape
	//
	// Specify characters that will be left unescaped when fragments are created
	// or merged using <jQuery.param.fragment>, or when the fragment is modified
	// using <jQuery.bbq.pushState>. This option only applies to serialized data
	// object fragments, and not set-as-string fragments. Does not affect the
	// query string. Defaults to ",/" (comma, forward slash).
	//
	// Note that this is considered a purely aesthetic option, and will help to
	// create URLs that "look pretty" in the address bar or bookmarks, without
	// affecting functionality in any way. That being said, be careful to not
	// unescape characters that are used as delimiters or serve a special
	// purpose, such as the "#?&=+" (octothorpe, question mark, ampersand,
	// equals, plus) characters.
	//
	// Usage:
	//
	// > jQuery.param.fragment.noEscape( [ chars ] );
	//
	// Arguments:
	//
	//  chars - (String) The characters to not escape in the fragment. If
	//    unspecified, defaults to empty string (escape all characters).
	//
	// Returns:
	//
	//  Nothing.

	jq_param_fragment.noEscape = function( chars ) {
		chars = chars || '';
		var arr = $.map( chars.split( '' ), encodeURIComponent );
		re_no_escape = new RegExp( arr.join( '|' ), 'g' );
	};

	// A sensible default. These are the characters people seem to complain about
	// "uglifying up the URL" the most.
	jq_param_fragment.noEscape( ',/' );

	// Method: jQuery.param.fragment.ajaxCrawlable
	//
	// TODO: DESCRIBE
	//
	// Usage:
	//
	// > jQuery.param.fragment.ajaxCrawlable( [ state ] );
	//
	// Arguments:
	//
	//  state - (Boolean) TODO: DESCRIBE
	//
	// Returns:
	//
	//  (Boolean) The current ajaxCrawlable state.

	jq_param_fragment.ajaxCrawlable = function( state ) {
		if (state !== undefined) {
			if (state) {
				re_params_fragment = /^.*(?:#!|#)/;
				re_fragment = /^([^#]*)(?:#!|#)?(.*)$/;
				fragment_prefix = '#!';
			} else {
				re_params_fragment = /^.*#/;
				re_fragment = /^([^#]*)#?(.*)$/;
				fragment_prefix = '#';
			}
			ajax_crawlable = !!state;
		}

		return ajax_crawlable;
	};

	jq_param_fragment.ajaxCrawlable( 0 );

	// Section: Deparam (from string)
	//
	// Method: jQuery.deparam
	//
	// Deserialize a params string into an object, optionally coercing numbers,
	// booleans, null and undefined values; this method is the counterpart to the
	// internal jQuery.param method.
	//
	// Usage:
	//
	// > jQuery.deparam( params [, coerce ] );
	//
	// Arguments:
	//
	//  params - (String) A params string to be parsed.
	//  coerce - (Boolean) If true, coerces any numbers or true, false, null, and
	//    undefined to their actual value. Defaults to false if omitted.
	//
	// Returns:
	//
	//  (Object) An object representing the deserialized params string.

	$.deparam = jq_deparam = function( params, coerce ) {
		var obj = {},
			coerce_types = { 'true': !0, 'false': !1, 'null': null };

		// Iterate over all name=value pairs.
		$.each( params.replace( /\+/g, ' ' ).split( '&' ), function( j, v ) {
			var param = v.split( '=' ),
				key = decode( param[0] ),
				val,
				cur = obj,
				i = 0,

			// If key is more complex than 'foo', like 'a[]' or 'a[b][c]', split it
			// into its component parts.
				keys = key.split( '][' ),
				keys_last = keys.length - 1;

			// If the first keys part contains [ and the last ends with ], then []
			// are correctly balanced.
			if (/\[/.test( keys[0] ) && /\]$/.test( keys[ keys_last ] )) {
				// Remove the trailing ] from the last keys part.
				keys[ keys_last ] = keys[ keys_last ].replace( /\]$/, '' );

				// Split first keys part into two parts on the [ and add them back onto
				// the beginning of the keys array.
				keys = keys.shift().split( '[' ).concat( keys );

				keys_last = keys.length - 1;
			} else {
				// Basic 'foo' style key.
				keys_last = 0;
			}

			// Are we dealing with a name=value pair, or just a name?
			if (param.length === 2) {
				val = decode( param[1] );

				// Coerce values.
				if (coerce) {
					val = val && !isNaN( val ) ? +val              // number
						: val === 'undefined' ? undefined         // undefined
						: coerce_types[val] !== undefined ? coerce_types[val] // true, false, null
						: val;                                                // string
				}

				if (keys_last) {
					// Complex key, build deep object structure based on a few rules:
					// * The 'cur' pointer starts at the object top-level.
					// * [] = array push (n is set to array length), [n] = array if n is
					//   numeric, otherwise object.
					// * If at the last keys part, set the value.
					// * For each keys part, if the current level is undefined create an
					//   object or array based on the type of the next keys part.
					// * Move the 'cur' pointer to the next level.
					// * Rinse & repeat.
					for (; i <= keys_last; i++) {
						key = keys[i] === '' ? cur.length : keys[i];
						cur = cur[key] = i < keys_last ?
							cur[key] || ( keys[i + 1] && isNaN( keys[i + 1] ) ? {} : [] )
							: val;
					}

				} else {
					// Simple key, even simpler rules, since only scalars and shallow
					// arrays are allowed.

					if ($.isArray( obj[key] )) {
						// val is already an array, so push on the next value.
						obj[key].push( val );

					} else if (obj[key] !== undefined) {
						// val isn't an array, but since a second value has been specified,
						// convert val into an array.
						obj[key] = [ obj[key], val ];

					} else {
						// val is a scalar.
						obj[key] = val;
					}
				}

			} else if (key) {
				// No value was defined, so set something meaningful.
				obj[key] = coerce ?
					undefined
					: '';
			}
		} );

		return obj;
	};

	// Method: jQuery.deparam.querystring
	//
	// Parse the query string from a URL or the current window.location.href,
	// deserializing it into an object, optionally coercing numbers, booleans,
	// null and undefined values.
	//
	// Usage:
	//
	// > jQuery.deparam.querystring( [ url ] [, coerce ] );
	//
	// Arguments:
	//
	//  url - (String) An optional params string or URL containing query string
	//    params to be parsed. If url is omitted, the current
	//    window.location.href is used.
	//  coerce - (Boolean) If true, coerces any numbers or true, false, null, and
	//    undefined to their actual value. Defaults to false if omitted.
	//
	// Returns:
	//
	//  (Object) An object representing the deserialized params string.

	// Method: jQuery.deparam.fragment
	//
	// Parse the fragment (hash) from a URL or the current window.location.href,
	// deserializing it into an object, optionally coercing numbers, booleans,
	// null and undefined values.
	//
	// Usage:
	//
	// > jQuery.deparam.fragment( [ url ] [, coerce ] );
	//
	// Arguments:
	//
	//  url - (String) An optional params string or URL containing fragment (hash)
	//    params to be parsed. If url is omitted, the current window.location.href
	//    is used.
	//  coerce - (Boolean) If true, coerces any numbers or true, false, null, and
	//    undefined to their actual value. Defaults to false if omitted.
	//
	// Returns:
	//
	//  (Object) An object representing the deserialized params string.

	function jq_deparam_sub( is_fragment, url_or_params, coerce ) {
		if (url_or_params === undefined || typeof url_or_params === 'boolean') {
			// url_or_params not specified.
			coerce = url_or_params;
			url_or_params = jq_param[ is_fragment ? str_fragment : str_querystring ]();
		} else {
			url_or_params = is_string( url_or_params ) ?
				url_or_params.replace( is_fragment ? re_params_fragment : re_params_querystring, '' )
				: url_or_params;
		}

		return jq_deparam( url_or_params, coerce );
	}

	jq_deparam[ str_querystring ] = curry( jq_deparam_sub, 0 );
	jq_deparam[ str_fragment ] = jq_deparam_fragment = curry( jq_deparam_sub, 1 );

	// Section: Element manipulation
	//
	// Method: jQuery.elemUrlAttr
	//
	// Get the internal "Default URL attribute per tag" list, or augment the list
	// with additional tag-attribute pairs, in case the defaults are insufficient.
	//
	// In the <jQuery.fn.querystring> and <jQuery.fn.fragment> methods, this list
	// is used to determine which attribute contains the URL to be modified, if
	// an "attr" param is not specified.
	//
	// Default Tag-Attribute List:
	//
	//  a      - href
	//  base   - href
	//  iframe - src
	//  img    - src
	//  input  - src
	//  form   - action
	//  link   - href
	//  script - src
	//
	// Usage:
	//
	// > jQuery.elemUrlAttr( [ tag_attr ] );
	//
	// Arguments:
	//
	//  tag_attr - (Object) An object containing a list of tag names and their
	//    associated default attribute names in the format { tag: 'attr', ... } to
	//    be merged into the internal tag-attribute list.
	//
	// Returns:
	//
	//  (Object) An object containing all stored tag-attribute values.

	// Only define function and set defaults if function doesn't already exist, as
	// the urlInternal plugin will provide this method as well.
	$[ str_elemUrlAttr ] || ($[ str_elemUrlAttr ] = function( obj ) {
		return $.extend( elemUrlAttr_cache, obj );
	})( {
		a: str_href,
		base: str_href,
		iframe: str_src,
		img: str_src,
		input: str_src,
		form: 'action',
		link: str_href,
		script: str_src
	} );

	jq_elemUrlAttr = $[ str_elemUrlAttr ];

	// Method: jQuery.fn.querystring
	//
	// Update URL attribute in one or more elements, merging the current URL (with
	// or without pre-existing query string params) plus any params object or
	// string into a new URL, which is then set into that attribute. Like
	// <jQuery.param.querystring (build url)>, but for all elements in a jQuery
	// collection.
	//
	// Usage:
	//
	// > jQuery('selector').querystring( [ attr, ] params [, merge_mode ] );
	//
	// Arguments:
	//
	//  attr - (String) Optional name of an attribute that will contain a URL to
	//    merge params or url into. See <jQuery.elemUrlAttr> for a list of default
	//    attributes.
	//  params - (Object) A params object to be merged into the URL attribute.
	//  params - (String) A URL containing query string params, or params string
	//    to be merged into the URL attribute.
	//  merge_mode - (Number) Merge behavior defaults to 0 if merge_mode is not
	//    specified, and is as-follows:
	//
	//    * 0: params in the params argument will override any params in attr URL.
	//    * 1: any params in attr URL will override params in the params argument.
	//    * 2: params argument will completely replace any query string in attr
	//         URL.
	//
	// Returns:
	//
	//  (jQuery) The initial jQuery collection of elements, but with modified URL
	//  attribute values.

	// Method: jQuery.fn.fragment
	//
	// Update URL attribute in one or more elements, merging the current URL (with
	// or without pre-existing fragment/hash params) plus any params object or
	// string into a new URL, which is then set into that attribute. Like
	// <jQuery.param.fragment (build url)>, but for all elements in a jQuery
	// collection.
	//
	// Usage:
	//
	// > jQuery('selector').fragment( [ attr, ] params [, merge_mode ] );
	//
	// Arguments:
	//
	//  attr - (String) Optional name of an attribute that will contain a URL to
	//    merge params into. See <jQuery.elemUrlAttr> for a list of default
	//    attributes.
	//  params - (Object) A params object to be merged into the URL attribute.
	//  params - (String) A URL containing fragment (hash) params, or params
	//    string to be merged into the URL attribute.
	//  merge_mode - (Number) Merge behavior defaults to 0 if merge_mode is not
	//    specified, and is as-follows:
	//
	//    * 0: params in the params argument will override any params in attr URL.
	//    * 1: any params in attr URL will override params in the params argument.
	//    * 2: params argument will completely replace any fragment (hash) in attr
	//         URL.
	//
	// Returns:
	//
	//  (jQuery) The initial jQuery collection of elements, but with modified URL
	//  attribute values.

	function jq_fn_sub( mode, force_attr, params, merge_mode ) {
		if (!is_string( params ) && typeof params !== 'object') {
			// force_attr not specified.
			merge_mode = params;
			params = force_attr;
			force_attr = undefined;
		}

		return this.each( function() {
			var that = $( this ),

			// Get attribute specified, or default specified via $.elemUrlAttr.
				attr = force_attr || jq_elemUrlAttr()[ ( this.nodeName || '' ).toLowerCase() ] || '',

			// Get URL value.
				url = attr && that.attr( attr ) || '';

			// Update attribute with new URL.
			that.attr( attr, jq_param[ mode ]( url, params, merge_mode ) );
		} );

	}

	$.fn[ str_querystring ] = curry( jq_fn_sub, str_querystring );
	$.fn[ str_fragment ] = curry( jq_fn_sub, str_fragment );

	// Section: History, hashchange event
	//
	// Method: jQuery.bbq.pushState
	//
	// Adds a 'state' into the browser history at the current position, setting
	// location.hash and triggering any bound <hashchange event> callbacks
	// (provided the new state is different than the previous state).
	//
	// If no arguments are passed, an empty state is created, which is just a
	// shortcut for jQuery.bbq.pushState( {}, 2 ).
	//
	// Usage:
	//
	// > jQuery.bbq.pushState( [ params [, merge_mode ] ] );
	//
	// Arguments:
	//
	//  params - (String) A serialized params string or a hash string beginning
	//    with # to merge into location.hash.
	//  params - (Object) A params object to merge into location.hash.
	//  merge_mode - (Number) Merge behavior defaults to 0 if merge_mode is not
	//    specified (unless a hash string beginning with # is specified, in which
	//    case merge behavior defaults to 2), and is as-follows:
	//
	//    * 0: params in the params argument will override any params in the
	//         current state.
	//    * 1: any params in the current state will override params in the params
	//         argument.
	//    * 2: params argument will completely replace current state.
	//
	// Returns:
	//
	//  Nothing.
	//
	// Additional Notes:
	//
	//  * Setting an empty state may cause the browser to scroll.
	//  * Unlike the fragment and querystring methods, if a hash string beginning
	//    with # is specified as the params agrument, merge_mode defaults to 2.

	jq_bbq.pushState = jq_bbq_pushState = function( params, merge_mode ) {
		if (is_string( params ) && /^#/.test( params ) && merge_mode === undefined) {
			// Params string begins with # and merge_mode not specified, so completely
			// overwrite window.location.hash.
			merge_mode = 2;
		}

		var has_args = params !== undefined,
		// Merge params into window.location using $.param.fragment.
			url = jq_param_fragment( location.href,
				has_args ? params : {}, has_args ? merge_mode : 2 );

		// Set new window.location.href. Note that Safari 3 & Chrome barf on
		// location.hash = '#' so the entire URL is set.
		location.href = url;
	};

	// Method: jQuery.bbq.getState
	//
	// Retrieves the current 'state' from the browser history, parsing
	// location.hash for a specific key or returning an object containing the
	// entire state, optionally coercing numbers, booleans, null and undefined
	// values.
	//
	// Usage:
	//
	// > jQuery.bbq.getState( [ key ] [, coerce ] );
	//
	// Arguments:
	//
	//  key - (String) An optional state key for which to return a value.
	//  coerce - (Boolean) If true, coerces any numbers or true, false, null, and
	//    undefined to their actual value. Defaults to false.
	//
	// Returns:
	//
	//  (Anything) If key is passed, returns the value corresponding with that key
	//    in the location.hash 'state', or undefined. If not, an object
	//    representing the entire 'state' is returned.

	jq_bbq.getState = jq_bbq_getState = function( key, coerce ) {
		return key === undefined || typeof key === 'boolean' ?
			jq_deparam_fragment( key ) // 'key' really means 'coerce' here
			: jq_deparam_fragment( coerce )[ key ];
	};

	// Method: jQuery.bbq.removeState
	//
	// Remove one or more keys from the current browser history 'state', creating
	// a new state, setting location.hash and triggering any bound
	// <hashchange event> callbacks (provided the new state is different than
	// the previous state).
	//
	// If no arguments are passed, an empty state is created, which is just a
	// shortcut for jQuery.bbq.pushState( {}, 2 ).
	//
	// Usage:
	//
	// > jQuery.bbq.removeState( [ key [, key ... ] ] );
	//
	// Arguments:
	//
	//  key - (String) One or more key values to remove from the current state,
	//    passed as individual arguments.
	//  key - (Array) A single array argument that contains a list of key values
	//    to remove from the current state.
	//
	// Returns:
	//
	//  Nothing.
	//
	// Additional Notes:
	//
	//  * Setting an empty state may cause the browser to scroll.

	jq_bbq.removeState = function( arr ) {
		var state = {};

		// If one or more arguments is passed..
		if (arr !== undefined) {

			// Get the current state.
			state = jq_bbq_getState();

			// For each passed key, delete the corresponding property from the current
			// state.
			$.each( $.isArray( arr ) ? arr : arguments, function( i, v ) {
				delete state[ v ];
			} );
		}

		// Set the state, completely overriding any existing state.
		jq_bbq_pushState( state, 2 );
	};

	// Event: hashchange event (BBQ)
	//
	// Usage in jQuery 1.4 and newer:
	//
	// In jQuery 1.4 and newer, the event object passed into any hashchange event
	// callback is augmented with a copy of the location.hash fragment at the time
	// the event was triggered as its event.fragment property. In addition, the
	// event.getState method operates on this property (instead of location.hash)
	// which allows this fragment-as-a-state to be referenced later, even after
	// window.location may have changed.
	//
	// Note that event.fragment and event.getState are not defined according to
	// W3C (or any other) specification, but will still be available whether or
	// not the hashchange event exists natively in the browser, because of the
	// utility they provide.
	//
	// The event.fragment property contains the output of <jQuery.param.fragment>
	// and the event.getState method is equivalent to the <jQuery.bbq.getState>
	// method.
	//
	// > $(window).bind( 'hashchange', function( event ) {
	// >   var hash_str = event.fragment,
	// >     param_obj = event.getState(),
	// >     param_val = event.getState( 'param_name' ),
	// >     param_val_coerced = event.getState( 'param_name', true );
	// >   ...
	// > });
	//
	// Usage in jQuery 1.3.2:
	//
	// In jQuery 1.3.2, the event object cannot to be augmented as in jQuery 1.4+,
	// so the fragment state isn't bound to the event object and must instead be
	// parsed using the <jQuery.param.fragment> and <jQuery.bbq.getState> methods.
	//
	// > $(window).bind( 'hashchange', function( event ) {
	// >   var hash_str = $.param.fragment(),
	// >     param_obj = $.bbq.getState(),
	// >     param_val = $.bbq.getState( 'param_name' ),
	// >     param_val_coerced = $.bbq.getState( 'param_name', true );
	// >   ...
	// > });
	//
	// Additional Notes:
	//
	// * Due to changes in the special events API, jQuery BBQ v1.2 or newer is
	//   required to enable the augmented event object in jQuery 1.4.2 and newer.
	// * See <jQuery hashchange event> for more detailed information.

	special[ str_hashchange ] = $.extend( special[ str_hashchange ], {

		// Augmenting the event object with the .fragment property and .getState
		// method requires jQuery 1.4 or newer. Note: with 1.3.2, everything will
		// work, but the event won't be augmented)
		add: function( handleObj ) {
			var old_handler;

			function new_handler( e ) {
				// e.fragment is set to the value of location.hash (with any leading #
				// removed) at the time the event is triggered.
				var hash = e[ str_fragment ] = jq_param_fragment();

				// e.getState() works just like $.bbq.getState(), but uses the
				// e.fragment property stored on the event object.
				e.getState = function( key, coerce ) {
					return key === undefined || typeof key === 'boolean' ?
						jq_deparam( hash, key ) // 'key' really means 'coerce' here
						: jq_deparam( hash, coerce )[ key ];
				};

				old_handler.apply( this, arguments );
			}

			// This may seem a little complicated, but it normalizes the special event
			// .add method between jQuery 1.4/1.4.1 and 1.4.2+
			if ($.isFunction( handleObj )) {
				// 1.4, 1.4.1
				old_handler = handleObj;
				return new_handler;
			} else {
				// 1.4.2+
				old_handler = handleObj.handler;
				handleObj.handler = new_handler;
			}
		}

	} );


/*!
 * jQuery hashchange event - v1.3 - 7/21/2010
 * http://benalman.com/projects/jquery-hashchange-plugin/
 * 
 * Copyright (c) 2010 "Cowboy" Ben Alman
 * Dual licensed under the MIT and GPL licenses.
 * http://benalman.com/about/license/
 */

// Script: jQuery hashchange event
//
// *Version: 1.3, Last updated: 7/21/2010*
// 
// Project Home - http://benalman.com/projects/jquery-hashchange-plugin/
// GitHub       - http://github.com/cowboy/jquery-hashchange/
// Source       - http://github.com/cowboy/jquery-hashchange/raw/master/jquery.ba-hashchange.js
// (Minified)   - http://github.com/cowboy/jquery-hashchange/raw/master/jquery.ba-hashchange.min.js (0.8kb gzipped)
// 
// About: License
// 
// Copyright (c) 2010 "Cowboy" Ben Alman,
// Dual licensed under the MIT and GPL licenses.
// http://benalman.com/about/license/
// 
// About: Examples
// 
// These working examples, complete with fully commented code, illustrate a few
// ways in which this plugin can be used.
// 
// hashchange event - http://benalman.com/code/projects/jquery-hashchange/examples/hashchange/
// document.domain - http://benalman.com/code/projects/jquery-hashchange/examples/document_domain/
// 
// About: Support and Testing
// 
// Information about what version or versions of jQuery this plugin has been
// tested with, what browsers it has been tested in, and where the unit tests
// reside (so you can test it yourself).
// 
// jQuery Versions - 1.2.6, 1.3.2, 1.4.1, 1.4.2
// Browsers Tested - Internet Explorer 6-8, Firefox 2-4, Chrome 5-6, Safari 3.2-5,
//                   Opera 9.6-10.60, iPhone 3.1, Android 1.6-2.2, BlackBerry 4.6-5.
// Unit Tests      - http://benalman.com/code/projects/jquery-hashchange/unit/
// 
// About: Known issues
// 
// While this jQuery hashchange event implementation is quite stable and
// robust, there are a few unfortunate browser bugs surrounding expected
// hashchange event-based behaviors, independent of any JavaScript
// window.onhashchange abstraction. See the following examples for more
// information:
// 
// Chrome: Back Button - http://benalman.com/code/projects/jquery-hashchange/examples/bug-chrome-back-button/
// Firefox: Remote XMLHttpRequest - http://benalman.com/code/projects/jquery-hashchange/examples/bug-firefox-remote-xhr/
// WebKit: Back Button in an Iframe - http://benalman.com/code/projects/jquery-hashchange/examples/bug-webkit-hash-iframe/
// Safari: Back Button from a different domain - http://benalman.com/code/projects/jquery-hashchange/examples/bug-safari-back-from-diff-domain/
// 
// Also note that should a browser natively support the window.onhashchange 
// event, but not report that it does, the fallback polling loop will be used.
// 
// About: Release History
// 
// 1.3   - (7/21/2010) Reorganized IE6/7 Iframe code to make it more
//         "removable" for mobile-only development. Added IE6/7 document.title
//         support. Attempted to make Iframe as hidden as possible by using
//         techniques from http://www.paciellogroup.com/blog/?p=604. Added 
//         support for the "shortcut" format $(window).hashchange( fn ) and
//         $(window).hashchange() like jQuery provides for built-in events.
//         Renamed jQuery.hashchangeDelay to <jQuery.fn.hashchange.delay> and
//         lowered its default value to 50. Added <jQuery.fn.hashchange.domain>
//         and <jQuery.fn.hashchange.src> properties plus document-domain.html
//         file to address access denied issues when setting document.domain in
//         IE6/7.
// 1.2   - (2/11/2010) Fixed a bug where coming back to a page using this plugin
//         from a page on another domain would cause an error in Safari 4. Also,
//         IE6/7 Iframe is now inserted after the body (this actually works),
//         which prevents the page from scrolling when the event is first bound.
//         Event can also now be bound before DOM ready, but it won't be usable
//         before then in IE6/7.
// 1.1   - (1/21/2010) Incorporated document.documentMode test to fix IE8 bug
//         where browser version is incorrectly reported as 8.0, despite
//         inclusion of the X-UA-Compatible IE=EmulateIE7 meta tag.
// 1.0   - (1/9/2010) Initial Release. Broke out the jQuery BBQ event.special
//         window.onhashchange functionality into a separate plugin for users
//         who want just the basic event & back button support, without all the
//         extra awesomeness that BBQ provides. This plugin will be included as
//         part of jQuery BBQ, but also be available separately.


	// Reused string.
	var

	// Method / object references.
		doc = document,
		fake_onhashchange,

	// Does the browser support window.onhashchange? Note that IE8 running in
	// IE7 compatibility mode reports true for 'onhashchange' in window, even
	// though the event isn't supported, so also test document.documentMode.
		doc_mode = doc.documentMode,
		supports_onhashchange = 'on' + str_hashchange in window && ( doc_mode === undefined || doc_mode > 7 );

	// Get location.hash (or what you'd expect location.hash to be) sans any
	// leading #. Thanks for making this necessary, Firefox!
	function get_fragment( url ) {
		url = url || location.href;
		return '#' + url.replace( /^[^#]*#?(.*)$/, '$1' );
	}

	// Method: jQuery.fn.hashchange
	//
	// Bind a handler to the window.onhashchange event or trigger all bound
	// window.onhashchange event handlers. This behavior is consistent with
	// jQuery's built-in event handlers.
	//
	// Usage:
	//
	// > jQuery(window).hashchange( [ handler ] );
	//
	// Arguments:
	//
	//  handler - (Function) Optional handler to be bound to the hashchange
	//    event. This is a "shortcut" for the more verbose form:
	//    jQuery(window).bind( 'hashchange', handler ). If handler is omitted,
	//    all bound window.onhashchange event handlers will be triggered. This
	//    is a shortcut for the more verbose
	//    jQuery(window).trigger( 'hashchange' ). These forms are described in
	//    the <hashchange event> section.
	//
	// Returns:
	//
	//  (jQuery) The initial jQuery collection of elements.

	// Allow the "shortcut" format $(elem).hashchange( fn ) for binding and
	// $(elem).hashchange() for triggering, like jQuery does for built-in events.
	$.fn[ str_hashchange ] = function( fn ) {
		return fn ? this.bind( str_hashchange, fn ) : this.trigger( str_hashchange );
	};

	// Property: jQuery.fn.hashchange.delay
	//
	// The numeric interval (in milliseconds) at which the <hashchange event>
	// polling loop executes. Defaults to 50.

	// Property: jQuery.fn.hashchange.domain
	//
	// If you're setting document.domain in your JavaScript, and you want hash
	// history to work in IE6/7, not only must this property be set, but you must
	// also set document.domain BEFORE jQuery is loaded into the page. This
	// property is only applicable if you are supporting IE6/7 (or IE8 operating
	// in "IE7 compatibility" mode).
	//
	// In addition, the <jQuery.fn.hashchange.src> property must be set to the
	// path of the included "document-domain.html" file, which can be renamed or
	// modified if necessary (note that the document.domain specified must be the
	// same in both your main JavaScript as well as in this file).
	//
	// Usage:
	//
	// jQuery.fn.hashchange.domain = document.domain;

	// Property: jQuery.fn.hashchange.src
	//
	// If, for some reason, you need to specify an Iframe src file (for example,
	// when setting document.domain as in <jQuery.fn.hashchange.domain>), you can
	// do so using this property. Note that when using this property, history
	// won't be recorded in IE6/7 until the Iframe src file loads. This property
	// is only applicable if you are supporting IE6/7 (or IE8 operating in "IE7
	// compatibility" mode).
	//
	// Usage:
	//
	// jQuery.fn.hashchange.src = 'path/to/file.html';

	$.fn[ str_hashchange ].delay = 50;
	/*
	 $.fn[ str_hashchange ].domain = null;
	 $.fn[ str_hashchange ].src = null;
	 */

	// Event: hashchange event
	//
	// Fired when location.hash changes. In browsers that support it, the native
	// HTML5 window.onhashchange event is used, otherwise a polling loop is
	// initialized, running every <jQuery.fn.hashchange.delay> milliseconds to
	// see if the hash has changed. In IE6/7 (and IE8 operating in "IE7
	// compatibility" mode), a hidden Iframe is created to allow the back button
	// and hash-based history to work.
	//
	// Usage as described in <jQuery.fn.hashchange>:
	//
	// > // Bind an event handler.
	// > jQuery(window).hashchange( function(e) {
	// >   var hash = location.hash;
	// >   ...
	// > });
	// >
	// > // Manually trigger the event handler.
	// > jQuery(window).hashchange();
	//
	// A more verbose usage that allows for event namespacing:
	//
	// > // Bind an event handler.
	// > jQuery(window).bind( 'hashchange', function(e) {
	// >   var hash = location.hash;
	// >   ...
	// > });
	// >
	// > // Manually trigger the event handler.
	// > jQuery(window).trigger( 'hashchange' );
	//
	// Additional Notes:
	//
	// * The polling loop and Iframe are not created until at least one handler
	//   is actually bound to the 'hashchange' event.
	// * If you need the bound handler(s) to execute immediately, in cases where
	//   a location.hash exists on page load, via bookmark or page refresh for
	//   example, use jQuery(window).hashchange() or the more verbose
	//   jQuery(window).trigger( 'hashchange' ).
	// * The event can be bound before DOM ready, but since it won't be usable
	//   before then in IE6/7 (due to the necessary Iframe), recommended usage is
	//   to bind it inside a DOM ready handler.

	// Override existing $.event.special.hashchange methods (allowing this plugin
	// to be defined after jQuery BBQ in BBQ's source code).
	special[ str_hashchange ] = $.extend( special[ str_hashchange ], {

		// Called only when the first 'hashchange' event is bound to window.
		setup: function() {
			// If window.onhashchange is supported natively, there's nothing to do..
			if (supports_onhashchange) { return false; }

			// Otherwise, we need to create our own. And we don't want to call this
			// until the user binds to the event, just in case they never do, since it
			// will create a polling loop and possibly even a hidden Iframe.
			$( fake_onhashchange.start );
		},

		// Called only when the last 'hashchange' event is unbound from window.
		teardown: function() {
			// If window.onhashchange is supported natively, there's nothing to do..
			if (supports_onhashchange) { return false; }

			// Otherwise, we need to stop ours (if possible).
			$( fake_onhashchange.stop );
		}

	} );

	// fake_onhashchange does all the work of triggering the window.onhashchange
	// event for browsers that don't natively support it, including creating a
	// polling loop to watch for hash changes and in IE 6/7 creating a hidden
	// Iframe to enable back and forward.
	fake_onhashchange = (function() {
		var self = {},
			timeout_id,

		// Remember the initial hash so it doesn't get triggered immediately.
			last_hash = get_fragment(),

			fn_retval = function( val ) { return val; },
			history_set = fn_retval,
			history_get = fn_retval;

		// Start the polling loop.
		self.start = function() {
			timeout_id || poll();
		};

		// Stop the polling loop.
		self.stop = function() {
			timeout_id && clearTimeout( timeout_id );
			timeout_id = undefined;
		};

		// This polling loop checks every $.fn.hashchange.delay milliseconds to see
		// if location.hash has changed, and triggers the 'hashchange' event on
		// window when necessary.
		function poll() {
			var hash = get_fragment(),
				history_hash = history_get( last_hash );

			if (hash !== last_hash) {
				history_set( last_hash = hash, history_hash );

				$( window ).trigger( str_hashchange );

			} else if (history_hash !== last_hash) {
				location.href = location.href.replace( /#.*/, '' ) + history_hash;
			}

			timeout_id = setTimeout( poll, $.fn[ str_hashchange ].delay );
		}

		// vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv
		// vvvvvvvvvvvvvvvvvvv REMOVE IF NOT SUPPORTING IE6/7/8 vvvvvvvvvvvvvvvvvvv
		// vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv
		$.browser.msie && !supports_onhashchange && (function() {
			// Not only do IE6/7 need the "magical" Iframe treatment, but so does IE8
			// when running in "IE7 compatibility" mode.

			var iframe,
				iframe_src;

			// When the event is bound and polling starts in IE 6/7, create a hidden
			// Iframe for history handling.
			self.start = function() {
				if (!iframe) {
					iframe_src = $.fn[ str_hashchange ].src;
					iframe_src = iframe_src && iframe_src + get_fragment();

					// Create hidden Iframe. Attempt to make Iframe as hidden as possible
					// by using techniques from http://www.paciellogroup.com/blog/?p=604.
					iframe = $( '<iframe tabindex="-1" title="empty"/>' ).hide()

						// When Iframe has completely loaded, initialize the history and
						// start polling.
						.one( 'load', function() {
							iframe_src || history_set( get_fragment() );
							poll();
						} )

						// Load Iframe src if specified, otherwise nothing.
						.attr( 'src', iframe_src || 'javascript:0' )

						// Append Iframe after the end of the body to prevent unnecessary
						// initial page scrolling (yes, this works).
						.insertAfter( 'body' )[0].contentWindow;

					// Whenever `document.title` changes, update the Iframe's title to
					// prettify the back/next history menu entries. Since IE sometimes
					// errors with "Unspecified error" the very first time this is set
					// (yes, very useful) wrap this with a try/catch block.
					doc.onpropertychange = function() {
						try {
							if (event.propertyName === 'title') {
								iframe.document.title = doc.title;
							}
						} catch (e) {}
					};

				}
			};

			// Override the "stop" method since an IE6/7 Iframe was created. Even
			// if there are no longer any bound event handlers, the polling loop
			// is still necessary for back/next to work at all!
			self.stop = fn_retval;

			// Get history by looking at the hidden Iframe's location.hash.
			history_get = function() {
				return get_fragment( iframe.location.href );
			};

			// Set a new history item by opening and then closing the Iframe
			// document, *then* setting its location.hash. If document.domain has
			// been set, update that as well.
			history_set = function( hash, history_hash ) {
				var iframe_doc = iframe.document,
					domain = $.fn[ str_hashchange ].domain;

				if (hash !== history_hash) {
					// Update Iframe with any initial `document.title` that might be set.
					iframe_doc.title = doc.title;

					// Opening the Iframe's document after it has been closed is what
					// actually adds a history entry.
					iframe_doc.open();

					// Set document.domain for the Iframe document as well, if necessary.
					domain && iframe_doc.write( '<script>document.domain="' + domain + '"</script>' );

					iframe_doc.close();

					// Update the Iframe's hash, for great justice.
					iframe.location.hash = hash;
				}
			};

		})();
		// ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
		// ^^^^^^^^^^^^^^^^^^^ REMOVE IF NOT SUPPORTING IE6/7/8 ^^^^^^^^^^^^^^^^^^^
		// ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

		return self;
	})();

//
/*
 <@depends>
 subscription.js,
 model.js,
 declarative.js,
 template.js,
 https://raw.github.com/cowboy/jquery-bbq/v1.2.1/jquery.ba-bbq.js
 </@depends>
 */


	var bbq = $.bbq,

		routes = [],

		defaultSegmentMatchers,

		matchInitialPath,

		bookmarkPaths = [];

	function updateUrlQueryStringWhenModelChange( e ) {

		var bookmarkPath = toLogicalPath( e.publisher.path ),
			model = {};

		model[bookmarkPath] = rootNode.get( bookmarkPath );

		bbq.pushState( model );

	}

	//bookmark should be called after model initialization
	//and before parsing, so that the state in url can be restored
	hm.bookmark = function( /* path1, path2, .. */ ) {

		var i,
			bookmarkPath,
			stateInUrl = bbq.getState(),
			stateInModel = {};

		//initialize model from url
		for (i = 0; i < arguments.length; i++) {
			bookmarkPath = arguments[i];

			if (bookmarkPath in stateInUrl) {
				//the states in url will override the state in model
				rootNode.set( bookmarkPath, stateInUrl[bookmarkPath] );
			}

			hm.sub( null, bookmarkPath, "afterUpdate", updateUrlQueryStringWhenModelChange );
			bookmarkPaths.push( bookmarkPath );
			stateInModel[bookmarkPath] = rootNode.get( bookmarkPath );
		}

		replaceUrl( $.param.fragment( location.href, stateInModel ) );
		return this;
	};

	var replaceUrl = history.replaceState ? function( url ) {
		history.replaceState( null, null, url );
	} : function( url ) {
		location.href = url;
	};

	hmFn.bookmark = function( subPath ) {

		var model = this;

		hm.bookmark.apply( hm, $.map( subPath ? arguments : [""], function( subPath ) {
			return model.getPath( subPath );
		} ) );

		return model;

	};

	//example of segmentMatcher is
	//string, such as "public", which is a fixed value
	//object { modelPath: "modelPath", constraint: "fixedValue" }
	//object { modelPath: "modelPath", constraint: /regex/ }
	//object { modelPath: "modelPath", constraint: function (segment) { return boolean; } }
	hm.route = function( segmentMatchers, isDefault ) {

		routes.push( segmentMatchers );
		if (isDefault) {
			defaultSegmentMatchers = segmentMatchers;
		}

		var segmentPath = getSegmentPath();

		//if the url has a route
		if (applySegmentMatchers( segmentPath, segmentMatchers )) {
			matchInitialPath = true;
		}
	};

	function redirectToDefaultPath() {
		if (defaultSegmentMatchers) {
			var segments = [];
			for (var i = 0; i < defaultSegmentMatchers.length; i++) {
				var segmentWatcher = defaultSegmentMatchers[i];
				if (isString( segmentWatcher )) {
					segments.push( segmentWatcher );
				} else {
					var modelValue = rootNode.get( segmentWatcher.modelPath );
					//if modelValue is not empty
					//the use segmentWatcher
					segments.push(
						!modelValue && modelValue !== false ?
							modelValue + "" :
							segmentWatcher.defaultValue
					);
				}
			}

			var urlHash = location.hash;
			var urlPath = location.href.replace( "#" + urlHash, "" );
			var newUrl = urlPath + "#" + segments.join( "/" );
			replaceUrl( newUrl );
		}
	}

	//return the first segment represented in object
	// return from bbq.getState();
	//a segment path is the part of "public/opinion/John/Doe" in url
	//http://localhost:8080/demo/routing/test1.html#public/opinion/John/Doe
	function getSegmentPath() {
		var stateInUrl = bbq.getState();
		var segmentPath;
		for (var key in stateInUrl) {
			if (stateInUrl[key] === "") {
				segmentPath = key;
			}
			break;
		}
		return segmentPath;
	}

	function isSegmentPathMatchedByMatchers( segmentPath, segmentMatchers ) {
		var segment, segmentMatcher, constraint, segments;
		if (!segmentPath) {
			return;
		}

		segments = segmentPath.split( "/" );

		if (segments.length !== segmentMatchers.length) {
			return;
		}
		var rtn = true;

		for (var i = 0; i < segments.length; i++) {
			segment = segments[i];
			segmentMatcher = segmentMatchers[i];
			if (isString( segmentMatcher )) {
				if (segmentMatcher == segment) {
					continue;
				} else {
					rtn = false;
					break;
				}
			} else if (isObject( segmentMatcher )) {
				constraint = segmentMatcher.constraint;
				if (!constraint) {
					continue;
				} else if (isString( constraint )) {
					if (constraint == segment) {
						continue;
					} else {
						rtn = false;
						break;
					}
				} else if (constraint.compile) {
					if (constraint.test( segment )) {
						continue;
					} else {
						rtn = false;
						break;
					}

				} else if (isFunction( constraint )) {
					if (constraint( segment )) {
						continue;
					} else {
						rtn = false;
						break;
					}
				} else {
					throw "invalid constraint";
				}
			} else {
				throw "invalid segment";
			}
		}

		return rtn;
	}

	function applySegmentMatchers( segmentPath, segmentMatchers ) {

		var segment,
			segmentMatcher, segments,
			isMatch = isSegmentPathMatchedByMatchers( segmentPath, segmentMatchers );

		if (isMatch) {
			segments = segmentPath.split( "/" );
		}

		for (var i = 0; i < segmentMatchers.length; i++) {
			segmentMatcher = segmentMatchers[i];
			var path = segmentMatcher.modelPath;
			if (!isUndefined( path )) {
				if (isMatch) {
					segment = segments[i];
					rootNode.set( path, segment );
				}
				hm.sub( null, path, "afterUpdate", updateUrlSegmentWhenModelChange );
			}
		}
		return isMatch;
	}

	function convertModelToUrlSegment( segmentPath, modelPath, segmentMatchers ) {

		if (isSegmentPathMatchedByMatchers( segmentPath, segmentMatchers )) {

			var segmentMatcher, segments = segmentPath.split( "/" );
			for (var i = 0; i < segments.length; i++) {
				segmentMatcher = segmentMatchers[i];
				if (segmentMatcher.modelPath == modelPath) {
					segments[i] = rootNode.get( modelPath );
					var newSegmentPath = segments.join( "/" );
					var urlHash = location.hash;
					var urlPath = location.href.replace( urlHash, "" );
					var newUrl = urlPath + urlHash.replace( segmentPath, newSegmentPath );
					replaceUrl( newUrl );
					return true;
				}
			}
		}
		return false;
	}

	function updateModelWhenUrlSegmentChange() {
		var segmentPath = getSegmentPath();
		if (segmentPath) {
			for (var i = 0; i < routes.length; i++) {
				if (applySegmentMatchers( segmentPath, routes[i] )) {
					return true;
				}
			}
		}
	}

	function updateUrlSegmentWhenModelChange( e ) {
		var isMatch,
			modelPath = e.publisher.path,
			segmentPath = getSegmentPath();
		if (segmentPath) {
			for (var i = 0; i < routes.length; i++) {
				isMatch = convertModelToUrlSegment( segmentPath, modelPath, routes[i] );
				if (isMatch) {
					return;
				}
			}
		}
	}

	//update model when hash change
	$( window ).bind( "hashchange", function /*updateModelWhenHashChanged*/() {
		if (!updateModelWhenUrlSegmentChange()) {
			redirectToDefaultPath();
		}

		var stateInUrl = bbq.getState();
		for (var bookmarkPath in stateInUrl) {
			if (bookmarkPaths.contains( bookmarkPath )) {
				rootNode.set( bookmarkPath, stateInUrl[bookmarkPath] );
			}
		}
	} );

	$( function() {
		if (!matchInitialPath) {
			redirectToDefaultPath();
		}
	} );
//
//<@depends>subscription.js, model.js, declarative.js, template.js</@depends>
//



	defaultOptions.selectedClass = "selected";
	defaultOptions.tabViewAttr = "data-tabView";
	defaultOptions.tabLinkAttr = "data-tabLink";
	defaultOptions.tabGroupAttr = "data-tabGroup";

	hm.workflowType( {

		//a tab can be tabView or tabLink
		highlightTab: function( e ) {
			var tabId = this.attr( defaultOptions.tabViewAttr ) || this.attr( defaultOptions.tabLinkAttr ),
				selectedClass = e.workflow.options || defaultOptions.selectedClass;

			if (e.publisher.get() == tabId) {
				this.addClass( selectedClass );
			} else {
				this.removeClass( selectedClass );
			}
		},

		//a tab can be tabView or tabLink
		highlightTabInContainer: function( e ) {
			var selectedTabId = e.publisher.get(),
				tabViewAttr = defaultOptions.tabViewAttr,
				tabLinkAttr = defaultOptions.tabLinkAttr,
				options = e.workflow.options,
				tabLinkAndTabViewSelector = options.selector,
				selectedClass = options.selectedClass || defaultOptions.selectedClass;

			this.find( tabLinkAndTabViewSelector ).andSelf().each( function( index, elem ) {
				var $elem = $( elem ),
					tabId = $elem.attr( tabViewAttr ) || $elem.attr( tabLinkAttr );

				if (tabId == selectedTabId) {
					$elem.addClass( selectedClass );
				} else {
					$elem.removeClass( selectedClass );
				}
			} );
		}
	} );

	//a tab can be tabView or tabLink
	//for tabLink use <li data-tabLink="news" data-sub="tab:category">News</li>
	//for tabView use <div data-tabView="news" data-sub="tab:category">contents</div>
	hm.behavior.tab = function( elem, path, elemBehavior, selectedClass ) {

		elemBehavior.appendSub( elem, path, "init afterUpdate", "*highlightTab", selectedClass );

		if ($( elem ).attr( defaultOptions.tabLinkAttr )) {
			elemBehavior.appendSub( path, elem, "click", handleTabLinkClick, defaultOptions.tabLinkAttr );
		}

	};

	function handleTabLinkClick ( e ) {
		this.set( e.publisher.attr( e.workflow.options ) );
		e.preventDefault();
		e.stopPropagation();

	}

	//a tabContainer can hold tabLink or tabView
	//it can be
	//<ul data-sub="tabContainer:category">
	//	<li data-tabLink="news">News</li>
	//	<li data-tabLink="opinion">Opinion</li>
	//	<li data-tabLink="sports">Sports</li>
	//</ul>
	//
	//<div class="tabs" data-sub="tabContainer:category">
	//	<div data-tabView="news">content</div>
	//	<div data-tabView="opinion">content</div>
	//</div>
	hm.behavior.tabContainer = function( elem, path, elemBehavior, tabGroupAndSelectedClass ) {

		tabGroupAndSelectedClass = tabGroupAndSelectedClass || "";
		tabGroupAndSelectedClass = tabGroupAndSelectedClass.split( "," );

		var tabViewAttr = defaultOptions.tabViewAttr,
			tabLinkAttr = defaultOptions.tabLinkAttr,
			tabGroupAttr = defaultOptions.tabGroupAttr,
			tabGroupSelector = tabGroupAndSelectedClass[0] ? "[" + tabGroupAttr + "='" + tabGroupAndSelectedClass[0] + "']" : "",
			tabLinkSelector = "[" + tabLinkAttr + "]" + tabGroupSelector,
			tabLinkAndTabViewSelector = tabLinkSelector + ",[" + tabViewAttr + "]" + tabGroupSelector;

		//update the tab model with the tabLink when click
		elemBehavior.appendSub( path, elem, "click", handleTabLinkClick, tabLinkAttr, tabLinkSelector /*delegateSelector*/ );

		//
		//highlight the tab when the path change
		elemBehavior.appendSub( elem, path, "init100 afterUpdate", "*highlightTabInContainer", {
			selector: tabLinkAndTabViewSelector,
			selectedClass: tabGroupAndSelectedClass[1]
		} );
	};

//data-sub="@app:appName,options"


	var appStore = {},
	//used to match "appName,options"
		rAppOptions = /^([^,]+)(,(.+))?$/,
		rLoadAppOptions = /^([^,]+)(,([^,]+))?(,(.+))?$/;

	//you app should implement load(elem, options) and unload(elem) method

	hm.App = hm.Class.extend(

		//instance members
		{
			initialize: function( seed ) {

				if (!seed.name) {
					throw "An app must have a name.";
				}
				this.callBase( "initialize", seed );

			},

			//it add additional logic beside the original load method
			//such as instance counting, instance association with the container
			//prepare to unload from the container
			bootstrap: function( viewContainer, modelContainer, options ) {
				if (!viewContainer || !this.loadable()) {
					return;
				}
				var app = this,
					buildModelResult,
					appName = app.name,
					appInstance = instanceManager.get( viewContainer, appName );

				//ensure that an application can be loaded into a container only once
				if (!appInstance) {
					if (app.buildRootModel !== false) {
						buildModelResult = app.buildRootModel( modelContainer, options );

					}

					if (isPromise( buildModelResult )) {

						buildModelResult.done( function() {

							app.buildRootView( viewContainer, modelContainer );

						} );

					} else {
						app.buildRootView( viewContainer, modelContainer );

					}

					instanceManager.add( viewContainer, modelContainer, appName, app );

					//pass appName using namespace of event name to the event handler
					$( viewContainer ).bind( "shutdown." + appName, function( e ) {
						app.shutdown( this, e.namespace );
						e.stopPropagation();
					} );

					app.instanceCount++;
					app.uid++;

				}
			},

			shutdown: function( viewContainer, modelContainer ) {

				var appName = this.name;
				var appInstance = instanceManager.get( viewContainer, appName );

				this.destroyRootView( viewContainer );
				this.destroyRootModel( appInstance.namespace );

				instanceManager.remove( viewContainer, appName );

				$( viewContainer ).unbind( "shutdown." + appName );

				this.instanceCount--;
			},

			//function( modelContainer, options ) {}
			fetchRootData: null,

			buildRootModel: function( modelContainer, options ) {
				var app = this;
				if (!app.fetchRootData) {
					throw "app.fetchRootData is not implemented";
				}

				var data = app.fetchRootData( modelContainer, options );

				if (isPromise( data )) {
					return data.done( function( data ) {
						hm.set( app.getNamespace( modelContainer ), data );
					} );
				} else {
					hm.set( app.getNamespace( modelContainer ), data );
				}

			},

			destroyRootModel: function( modelNamespace ) {
				if (this.buildRootModel !== false) {
					hm.del( modelNamespace );
				}
			},

			buildRootView: function( viewContainer, modelContainer ) {

				var namespace = this.getNamespace( modelContainer );
				var wrapper = $( "<div></div>" ).attr( "appname", this.name );
				wrapper.hmData( "ns", namespace );
				wrapper.appendTo( $( viewContainer ) ).renderContent(
					this.getTemplateOptions(),
					namespace );

			},

			destroyRootView: function( viewContainer ) {
				$( viewContainer ).find( "> [appname='" + this.name + "']" ).remove();
			},

			getTemplateOptions: function() {
				return this.templateOptions || this.name;

			},

			getNamespace: function( modelContainer ) {
				var subPath = this.subPath || this.name;
				if (this.uid) {
					subPath = subPath + this.uid;
				}
				return hm( modelContainer ).getPath( subPath );
			},

			instanceCount: 0,

			uid: 0,

			//if we want to use singleton use the following
			//		loadable: function() {
			//			return !this.instanceCount;
			//		},
			loadable: returnTrue,

			templateOptions: null,

			subPath: null


		},

		//static members
		{

			//hm.App.register({
			//  name: "gmail", //you must have a name
			//  load: function (viewContainer, modelContainer, options) {},
			//  unapp: function (viewContainer, modelContainer) {}, //optional
			//  //optional, by default it is not loadable if it has been loaded once
			//  //if it is loadable: true , it means it is always loadable
			//  loadable: function () {},
			// });
			add: function( app ) {
				if (!(app instanceof this)) {
					app = this( app );
				}
				appStore[app.name] = app;
			},

			remove: function( appName ) {
				if (appStore[appName] && !appStore[appName].instanceCount) {
					delete appStore[appName];
				}
			},

			get: function( appName ) {
				return appStore[appName];
			},

			fetch: function( appName ) {
				return matrix( appName + ".app" );
			},

			//support the following feature
			//by default container is body, if container is missing
			//hm.App.bootstrap(appName);
			//
			//hm.App.bootstrap(appName, viewContainer); //viewContainer is jQuery
			//hm.App.bootstrap(appName, modelContainer); //modelContainer is string
			//
			//container is jQuery object, or DOM element
			//appName is string,
			//options is optional
			bootstrapApp: function( appName, viewContainer, modelContainer, options ) {

				if (arguments.length == 1) {

					viewContainer = document.body;
					modelContainer = "";

				} else if (arguments.length == 2) {

					if (viewContainer.jquery) {

						viewContainer = viewContainer[0];
						modelContainer = "";

					} else if (isString( viewContainer )) {

						modelContainer = viewContainer;
						viewContainer = document.body;
						modelContainer = "";
					}
				}

				var app = appStore[appName];

				if (app) {

					app.bootstrap( viewContainer, modelContainer, options );

				} else {

					this.fetch( appName ).done( function() {
						appStore[appName].bootstrap( viewContainer, modelContainer, options );
					} );
				}
			},

			//container by default is document.body
			//hm.App.shutdown(appName)
			//hm.App.shutdown(container, appName);
			shutdownApp: function( appName, viewContainer ) {
				if (isUndefined( appName )) {
					appName = viewContainer;
					viewContainer = document.body;
				}

				var appInstance = instanceManager.get( viewContainer, appName );
				if (appInstance) {
					appInstance.app.shutdown( viewContainer, appInstance.modelContainer );
				}
			}

		} );

	var instanceManager = {

		get: function( viewContainer, appName ) {
			return this.appData( viewContainer )[appName];
		},

		add: function( viewContainer, modelContainer, appName, app ) {
			this.appData( viewContainer )[appName] = {
				app: app,
				namespace: app.getNamespace( modelContainer ),
				modelContainer: modelContainer
			};
		},

		remove: function( viewContainer, appName ) {
			delete this.appData( viewContainer )[appName];
		},

		appData: function( viewContainer, readOnly ) {
			var appData = $( viewContainer ).hmData( "app" );
			if (!readOnly && !appData) {
				appData = { };
				$( viewContainer ).hmData( "app", appData );
			}
			return appData;
		}
	};

	hm.behavior( {
		//data-sub="app:/|gmail,options"
		app: function( elem, path, elemBehavior, options ) {

			var optionParts = rAppOptions.exec( $.trim( options ) ),
				appName = optionParts[1],
				otherOptions = optionParts[3];

			hm.App.bootstrapApp( appName, elem, path, otherOptions );
		},

		//unload app from parent container
		//data-sub="unapp:_|gmail"
		unapp: function( elem, parseContext, elemBehavior, options ) {
			$( elem ).mapEvent( "click", "shutdown." + options );
		},

		//load an app when click
		//data-sub="bootstrap:/|gmail,#containerId,options"
		bootstrap: function( elem, path, elemBehavior, options ) {

			var optionParts = rLoadAppOptions.exec( $.trim( options ) ),
				appName = optionParts[1],
				container = $( optionParts[3] )[0],
				otherOptions = optionParts[5];

			$( elem ).click( function() {
				hm.App.bootstrapApp( appName, container, path, otherOptions );
			} );
		},

		//unload an app when click
		//data-sub="shutdown:_|gmail,#container"
		shutdown: function( elem, path, elemBehavior, options ) {

			var optionParts = rLoadAppOptions.exec( $.trim( options ) ),
				appName = optionParts[1],
				container = $( optionParts[3] )[0];

			$( elem ).click( function() {
				hm.App.shutdownApp( appName, container );
			} );
		}



	} );

	var _cleanDataForApp = $.cleanData;

	$.cleanData = function( elems ) {
		$( elems ).each( function() {
			var appData = instanceManager.appData( this, true );
			if (appData) {
				for (var key in appData) {
					var app = appData[key];
					delete appData[key];
					app.unload( this, true );
				}
			}
		} );
		_cleanDataForApp( elems );
	};

	matrix.loader.set( "app", "js", {
		url: "folder"
	} );



})( jQuery, window );

