package com.angrysurfer.shrapnel.factory;

import com.angrysurfer.shrapnel.Export;
import com.angrysurfer.shrapnel.IExport;

import java.lang.reflect.Constructor;
import java.lang.reflect.InvocationTargetException;
import java.util.Collection;
import java.util.Collections;

public interface IExportFactory {

	default Collection getData() {
		return Collections.EMPTY_LIST;
	}

	String getExportName();

	default Class getExportClass() {
		return Export.class;
	}

	default IExport newInstance() throws ClassNotFoundException, NoSuchMethodException, InvocationTargetException, InstantiationException, IllegalAccessException {
		Class< ? > clazz = Class.forName(getExportClass().getCanonicalName());
		Constructor< ? > ctor = clazz.getConstructor();
		return (IExport) ctor.newInstance(new Object[]{ });
	}
}
