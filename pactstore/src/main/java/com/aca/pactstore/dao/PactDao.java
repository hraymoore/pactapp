package com.aca.pactstore.dao;

import java.util.List;

import com.aca.pactstore.model.Genre;
import com.aca.pactstore.model.Contract;

public interface PactDao {
	
	public List<Contract> getContracts(); 
	public List<Contract> getContractsByGenre(Genre genre);
	public List<Contract> getContractsByReleaseYear(Integer releaseYear);
	
	
	

}
