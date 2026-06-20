package com.angrysurfer.shrapnel.model.value;

import lombok.Getter;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;

import jakarta.persistence.*;

import jakarta.persistence.*;

@Slf4j
@Getter
@Setter
@Entity
@Table(name = "value_string", schema = "shrapnel_data")
public class StringValue {

	@Id
	@GeneratedValue(strategy = GenerationType.AUTO)
	@Column(name = "id", nullable = false)
	private Long id;

	@Column(name = "value", nullable = false)
	private String value;
}
