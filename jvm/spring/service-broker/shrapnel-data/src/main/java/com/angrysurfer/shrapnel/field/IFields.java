package com.angrysurfer.shrapnel.field;

import java.util.List;

public interface IFields extends List<IField> {

    default void addFieldSpec(IField fieldSpec) {
        fieldSpec.setIndex(size());
        add(fieldSpec);
    }
}
