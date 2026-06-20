package com.angrysurfer.shrapnel.component.writer.style.adapter;

import com.angrysurfer.shrapnel.PropertyConfig;
import com.itextpdf.kernel.colors.Color;
import com.itextpdf.kernel.colors.WebColors;

public class HeaderCellStyleAdapter extends CellStyleAdapter {

    static String GREEN = "1c8214";

    public HeaderCellStyleAdapter() {
        super();
        PropertyConfig defaults = PropertyConfig.getInstance();
        setBackgroundColor(WebColors.getRGBColor(defaults.getOrDefault("header.background", GREEN).toString()));
        setFontColor(defaults.containsKey("header.font.color") ?
                WebColors.getRGBColor(defaults.getProperty("header.font.color").toString()) :
                WebColors.getRGBColor("white"));
        setBold();
    }
}
