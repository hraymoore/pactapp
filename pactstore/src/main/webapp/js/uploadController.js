/**
* Access the previously created module 'pactapp'
*/

(function() {
	var pactapp = angular.module('pactapp');

	pactapp.controller('uploadController', function($scope, $http) {			
		
		$scope.genres = ['Freelance','Law','Business','Music'];
		
		$scope.uploadContract = function() {
			$http.post("/pactstore/webapi/contracts", $scope.contract)
			.then(function(response) {				
				$scope.uploadStatus = 'create successful';
				$scope.disableUpload = true;
			}, function(response) {
				$scope.uploadStatus = 'error trying to upload contract';	
				console.log('error http POST movies: ' + response.status);
			});
		}
		
		$scope.clear = function() {
			$scope.contract.title = '';
			$scope.contract.releaseYear = '';
			$scope.contract.genre = '';
			$scope.disableCreate = false;
			$scope.createStatus = '';
		}
		
	});
	
})()