package com.angrysurfer.shrapnel.service;

import com.angrysurfer.shrapnel.factory.IExportFactory;
import com.angrysurfer.shrapnel.factory.IMetaExportFactory;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import jakarta.annotation.Resource;
import java.util.Collection;
import java.util.List;
import java.util.stream.Collectors;


import org.springframework.beans.factory.annotation.Autowired;

@Slf4j
@Getter
@Service
public class ExportsService implements IExportsService {

	private final List< IMetaExportFactory > metaFactories;
	private final List< IExportFactory > exporterFactories;

	    public ExportsService(List< IMetaExportFactory > metaFactories, List< IExportFactory > exporterFactories) {		this.metaFactories = metaFactories;
		this.exporterFactories = exporterFactories;
	}


	private boolean factoryRegistered(Request request) {
		return metaFactories.stream().anyMatch(fac -> fac.hasFactory(request));
	}

	private IMetaExportFactory getMetaFactory(Request request) {
		return metaFactories.stream().filter(fac -> fac.hasFactory(request)).findFirst().orElseGet(() -> null);
	}

	public IExportFactory getFactory(Request request) {
		return getExporterFactories().stream().filter(fac -> fac.getExportName().equalsIgnoreCase(request.getName())).findFirst()
				.orElseGet(() -> factoryRegistered(request) ? getMetaFactory(request).newInstance(request) : null);
	}

	@Override
	public List< String > getAvailableExports() {
		List< String > metas = getMetaFactories().stream().map(mt -> mt.getAvailableExports()).flatMap(Collection::stream)
				.distinct().collect(Collectors.toList());

		metas.addAll(getExporterFactories().stream().map(f -> f.getExportName()).collect(Collectors.toList()));
		return metas;
	}
}
