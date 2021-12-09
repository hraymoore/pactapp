/**
* Access the previously created module 'movieapp'
*/

(function() { 
	var pactapp = angular.module('pactapp');

	pactapp.controller('updateController', function($scope, $http, $routeParams, $location) {
		
		$scope.getContractsById = function() {
			$http.get("/pactstore/webapi/contracts/" + $routeParams.pactId)
			.then(function(response) {
				let contracts = response.data;
				if (contract.length == 1) {
					$scope.contract = contracts[0];
				} else {
					//TODO error
				}
			}, function(response) {
				console.log('error http GET contracts by id -  ' + response.status);
			});
		}
		
		$scope.updateContract = function() {
			$http.put("/pactstore/webapi/contracts", $scope.contract)
			.then(function(resopnse) {
					$scope.updateStatus = 'update successful';
			}, function(response) {
				$scope.updateStatus = 'error trying to update contract';
				console.log('error http PUT contracts:' + response.status);
			});
		}
		
		$scope.deleteContract = function() {
			$http.delete("/pactstore/webapi/contracts/" + $scope.contract.id)
			.then(function(response){
				$scope.updateStatus = 'delete successful';
				$scope.disableUpdate = true;
			}, function(response) {
				$scope.updateStatus = 'error trying to delete contract';
				console.log('error http DELETE contracts: ' + response.status);
			})
		}
		
		$scope.goToSearchView = function() {
			console.log('go to search view')
			$location.path('/search');
		}
			
		$scope.genres = ['Freelance','Business','Law','Music'];
		
		$scope.getContractsById();

	
});	
	
})()