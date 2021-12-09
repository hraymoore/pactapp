package com.aca.pactstore.dao;

import java.util.ArrayList;
import java.util.List;

import com.aca.pactstore.model.Genre;
import com.aca.pactstore.model.Contract;

public class PactDaoMock implements PactDao {
	
	private static List<Contract> contracts = new ArrayList<Contract>();
	
	static {
		Contract bond = new Contract();
		bond.setTitle("The World Is Not Enough");
		bond.setReleaseYear(1999);
		bond.setGenre(Genre.Business);
		
		Contract jerk = new Contract ();
		jerk.setTitle("The Jerk");
		jerk.setReleaseYear(1979);
		jerk.setGenre(Genre.Freelance);
		
		Contract it = new Contract();
		it.setTitle("IT");
		it.setReleaseYear(2017);
		it.setGenre(Genre.Law);
		
		Contract starWars = new Contract();
		starWars.setTitle("Star Wars");
		starWars.setReleaseYear(1977);
		starWars.setGenre(Genre.Music);
		
		Contract spaceBalls = new Contract();
		spaceBalls.setTitle("Spaceballs");
		spaceBalls.setReleaseYear(1987);
		spaceBalls.setGenre(Genre.Business);
		
		contracts.add(bond);
		contracts.add(jerk);
		contracts.add(it);
		contracts.add(starWars);
		contracts.add(spaceBalls);
	}

	@Override
	public List<Contract> getContracts() {
	List<Contract> myContracts = new ArrayList<Contract>();
	myContracts.addAll(contracts);
		return myContracts ;
	}

	@Override
	public List<Contract> getContractsByGenre(Genre genre) {
		List<Contract> myContracts = new ArrayList<Contract>();
		for(Contract contract : PactDaoMock.contracts ) {
			if (contract.getGenre().equals(genre)) {
				myContracts.add(contract);
			}
		}
		return myContracts;
	}

	@Override
	public List<Contract> getContractsByReleaseYear(Integer releaseYear) {
		List<Contract> myContracts = new ArrayList<Contract>();
		for(Contract contract : PactDaoMock.contracts ) {
	//		if (contracts.getReleaseYear().intValue() == releaseYear) {
	//			myContracts.add(contract);
	//		}
		}
		return myContracts;
	}
	}


