package com.aca.pactstore.controller;

import java.util.List;

import com.aca.pactstore.model.Genre;
import com.aca.pactstore.model.Contract;
import com.aca.pactstore.service.PactService;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

@Path("/contracts")
@Produces(MediaType.APPLICATION_JSON)
public class PactController {
	
	private PactService service = new PactService();
	
	@GET
	@Path("/genre/{genreValue}")
	public List<Contract> getContracts() {
		return service.getContracts();
	}
	
	@GET
	@Path("/genre/{genreValue}")
	public List<Contract> getContractsByGenre(@PathParam("genreValue") Genre genre) {
		return service.getContractsByGenre(genre);
	}
	
	@GET
	@Path("/releaseyear/{releaseYearValue}")
	public List<Contract> getContractsByReleaseYear(@PathParam("releaseYearValue") Integer releaseYear) {
		return service.getContractsByReleaseYear(releaseYear);
	}
	
}

