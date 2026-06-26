select
#        em.id as export_id,
#        fs.id as field_id, fs.field_index,
em.name          as "export",
fs.property_name as property,
fs.label         as label,
ft.name          as field_type
from export em,
     field fs,
     field_type ft,
     export_field emfs
where em.id = emfs.export_id
  and fs.id = emfs.field_id
  and fs.field_type_id = ft.code
order by em.name, fs.field_index;