// jstl
(function (publicApi) {
	var templateMap = {};
	var loadedUrls = {};
	function loadTemplates(url) {
		if (url == undefined) {
			if (typeof document == "undefined") {
				return;
			}
			var scripts = document.getElementsByTagName("script");
			var lastScript = scripts[scripts.length - 1];
			url = lastScript.getAttribute("src");
		}
		if (loadedUrls[url]) {
			return;
		}
		loadedUrls[url] = true;

		var code = "";
		if (typeof XMLHttpRequest != 'undefined') {
			// In browser
			var xhr = new XMLHttpRequest();
			xhr.open("GET", url, false);
			xhr.send();
			code = xhr.responseText;
		} else if (typeof require != 'undefined') {
			// Server-side
			var fs = require('fs');
			code = fs.readFileSync(url).toString();
		}

		var parts = (" " + code).split(/\/\*\s*[Tt]emplate:/);
		parts.shift();
		for (var i = 0; i < parts.length; i++) {
			var part = parts[i];
			part = part.substring(0, part.indexOf("*/"));
			var endOfLine = part.indexOf("\n");
			var key = part.substring(0, endOfLine).trim();
			var template = part.substring(endOfLine + 1);
			templateMap[key] = template;
		}
	}
	function getTemplate(key) {
		loadTemplates();
		var rawCode = templateMap[key];
		if (rawCode) {
			return create(rawCode);
		}
		return null;
	}
	function create(rawCode) {
		return {
			toString: function () {return this.code;},
			code: rawCode,
			compile: function (directEvalFunction, constFunctions) {
				return compile(this.code, directEvalFunction, constFunctions);
			}
		};
	}

	function compile(template, directEvalFunction, headerText) {
		if (directEvalFunction == undefined) {
			directEvalFunction = publicApi.defaultFunction;
		}
		if (headerText == undefined) {
			headerText = publicApi.defaultHeaderCode;
		}
		var constants = [];
		var variables = [];
		
		var substitutionFunctionName = "subFunc" + Math.floor(Math.random()*1000000000);
		var resultVariableName = "result" + Math.floor(Math.random()*1000000000);
		var jscode = '(function () {\n';
		
		var directFunctions = [];
		var directFunctionVarNames = [];
		var parts = (" " + template).split(/<\?js|<\?|<%/g);
		var initialString = parts.shift().substring(1);
		jscode += '	var ' + resultVariableName + ' = ' + JSON.stringify(initialString) + ';\n';
		jscode += '	var echo = function (str) {' + resultVariableName + ' += str;};\n';
		if (headerText) {
			jscode += "\n" + headerText + "\n";
		}
		while (parts.length > 0) {
			var part = parts.shift();
			var endIndex = part.match(/\?>|%>/).index;
			var embeddedCode = part.substring(0, endIndex);
			var constant = part.substring(endIndex + 2);
			
			if (/\s/.test(embeddedCode.charAt(0))) {
				jscode += "\n" + embeddedCode + "\n";
			} else {
				var argName = "fn" + Math.floor(Math.random()*10000000000);
				directFunctionVarNames.push(argName);
				directFunctions.push(directEvalFunction(embeddedCode));
				jscode += "\n\t" + resultVariableName + " += " + argName + ".apply(this, arguments);\n";
			}
			
			jscode += '	' + resultVariableName + ' += ' + JSON.stringify(constant) + ';\n';
		}
		jscode += '\n	return ' + resultVariableName + ';\n})';
		
		var f = Function.apply(null, directFunctionVarNames.concat(["return " + jscode]));
		return f.apply(null, directFunctions);
	}
	
	function defaultFunction(varName) {
		return function (data) {
			var string = "" + data[varName];
			return string.replace("&", "&amp;").replace("<", "&lt;").replace(">", "gt;").replace('"', "&quot;").replace("'", "&#39;");
		};
	};
	
	publicApi.loadTemplates = loadTemplates;
	publicApi.getTemplate = getTemplate;
	publicApi.create = create;
	publicApi.defaultFunction = defaultFunction;
	publicApi.defaultHeaderCode = "var value = arguments[0];";
})((typeof module !== 'undefined' && module.exports) ? exports : (this.jstl = {}, this.jstl));

// Jsonary plugin
(function (Jsonary) {
	
	/* Template: jsonary-template-header-code
	var data = arguments[0], context = arguments[1];
	function want(path) {
		var subData = data.subPath(path);
		return subData.defined() || !subData.readOnly();
	};
	function action(html, actionName) {
		echo(context.actionHtml.apply(context, arguments));
	};
	function render(subData) {
		echo(context.renderHtml(subData));
	};
	*/
	var headerCode = jstl.getTemplate('jsonary-template-header-code').code;
	var substitutionFunction = function (path) {
		if (path == "$") {
			return function (data, context) {
				return context.renderHtml(data);
			};
		} else if (path.charAt(0) == "/") {
			return function (data, context) {
				return context.renderHtml(data.subPath(path));
			};
		} else {
			return function (data, context) {
				var string = "" + data.propertyValue(path);
				return string.replace("&", "&amp;").replace("<", "&lt;").replace(">", "gt;").replace('"', "&quot;").replace("'", "&#39;");
			}
		}
	};
	
	Jsonary.extend({
		template: function (key) {
			var template = jstl.getTemplate(key);
			if (template == null) {
				throw new Exception("Could not locate template: " + key);
			}
			return template.compile(substitutionFunction, headerCode);
		},
		loadTemplates: function () {
			jstl.loadTemplates();
		}
	});
})(Jsonary);
