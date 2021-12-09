package com.aca.pactstore.service;

import java.util.List;

import com.aca.pactstore.dao.PactDao;
import com.aca.pactstore.dao.PactDaoMock;
import com.aca.pactstore.model.Genre;
import com.aca.pactstore.model.Contract;
import com.aca.pactstore.model.RequestError;

import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;

public class PactService {
	
	private PactDao pactDao = new PactDaoMock();
	
	public List<Contract> getContracts() {
		return pactDao.getContracts();
	}

	public List<Contract> getContractsByGenre(Genre genre) {
		return pactDao.getContractsByGenre(genre);
	}
	
	public List<Contract> getContractsByReleaseYear(Integer releaseYear) {
		validateReleaseYear(releaseYear);
		return pactDao.getContractsByReleaseYear(releaseYear);
	}
	
	private void validateReleaseYear(Integer releaseYear) {
		if (releaseYear < 1935 || releaseYear > 2025) {
			RequestError error = new RequestError(100, 
					"Invalid value for release year. Value must be >= 1935 and <=2025");
			Response response = Response.status(400)
					.entity(error)
					.build();
			throw new WebApplicationException(response);
		}
		
	}
}
