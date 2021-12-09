/**
 * creates a new module named 'pactapp'
 */

(function() {
	var pactapp = angular.module('pactapp', ['ngRoute']);
	
	pactapp.config(function($routeProvider) {
		  $routeProvider
		  .when("/search", {
		    templateUrl : "search.html",
		    controller : "searchController"
		  })
		  .when("/upload", {
		    templateUrl : "upload.html",
		    controller : "uploadController"
		  })
		  .when("/stack", {
		    templateUrl : "stack.html"
		  })
		  .when("/resume", {
		    templateUrl : "resume.html"
		  })
		  .when("/update/:pactId", {
		    templateUrl : "update.html",
		    controller : "updateController"
		  })
		  .otherwise({
			  templateUrl : "main.html"
		  });
		});
		
})()