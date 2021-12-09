/**
* Access the previously created module 'movieapp'
*/

(function() {
	var pactapp = angular.module('pactapp');

	pactapp.controller('searchController', function($scope, $http, $location) {
		
		$scope.showView false;
		
		$scope.getAllContracts = function() {
			$http.get("/pactstore/webapi/contracts")
			.then(function(response) {
				$scope.contracts = response.data;
				console.log('number of contracts: ' + $scope.contracts.length);
				$scope.showView = true;
			}, function(response) {
				console.log('error http GET contracts: ' + response.status);
			});
		}
		
		$scope.goToUpdateView = function(pactId) {
			console.log('go to update view, pactId: ' + pactId);
			$location.path('/search/' + pactId);
		}

		$scope.getAllContracts();
		
		
		(function() {
			var pactapp = angular.module('pactapp');

			pactapp.controller('searchController', function($scope, $http) {			
				
				$scope.genres = ['Freelance','Business','Law','Music'];
				
				$scope.uploadContract = function() {
					$http.post("/pactstore/webapi/contracts", $scope.contract)
					.then(function(response) {				
						$scope.uploadStatus = 'upload successful';
						$scope.disableUpload = true;
					}, function(response) {
						$scope.uploadStatus = 'error trying to upload contract';	
						console.log('error http POST contracts: ' + response.status);
					});
				}
				
				$scope.clear = function() {
					$scope.contract.title = '';
					$scope.contract.releaseYear = '';
					$scope.contract.genre = '';
					$scope.disableUpload = false;
				}
				
		
//		
		
		$scope.contracts = [
//			{
//				createDateTime: "2018-11-01 19:52:28.0",	        
//				genre: "Action",
//				id: 10,
//				releaseYear: 1990,
//				title: "The World Is Not Enough"	        
//			},
//			{
//				createDateTime: "2018-11-08 19:42:35.0",
//				genre: "Horror",
//				id: 11,
//				releaseYear: 1977,
//				title: "Star Wars"
//			},
//			{
//				createDateTime: "2018-11-08 19:42:56.0",	        
//				genre: "Comedy",
//				id: 12,
//				releaseYear: 1987,
//				title: "Spaceballs"	        
//			},
//			{
//				createDateTime: "2018-11-08 20:14:06.0",	        
//				genre: "Science_Fiction",
//				id: 13,
//				releaseYear: 1971,
//				title: "Java Rocks!"	        
//			}
//			];
//		
		$scope.getAllContracts();

	
	});	

})()