drop schema if exists media;
create schema media;
use media;

-- MySQL dump 10.13  Distrib 5.7.21, for Linux (x86_64)
--
-- Host: localhost    Database: media
-- ------------------------------------------------------
-- Server version	5.7.21-0ubuntu0.16.04.1

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `alias`
--

DROP TABLE IF EXISTS `alias`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `alias` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(25) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `alias`
--

LOCK TABLES `alias` WRITE;
/*!40000 ALTER TABLE `alias` DISABLE KEYS */;
/*!40000 ALTER TABLE `alias` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `alias_file_attribute`
--

DROP TABLE IF EXISTS `alias_file_attribute`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `alias_file_attribute` (
  `file_attribute_id` int(11) unsigned NOT NULL,
  `alias_id` int(11) unsigned NOT NULL,
  PRIMARY KEY (`file_attribute_id`,`alias_id`),
  KEY `fk_alias_file_attribute_file_attribute1_idx` (`file_attribute_id`),
  KEY `fk_alias_file_attribute_alias1_idx` (`alias_id`),
  CONSTRAINT `fk_alias_file_attribute_alias` FOREIGN KEY (`alias_id`) REFERENCES `alias` (`id`),
  CONSTRAINT `fk_alias_file_attribute_file_attribute1` FOREIGN KEY (`file_attribute_id`) REFERENCES `file_attribute` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `alias_file_attribute`
--

LOCK TABLES `alias_file_attribute` WRITE;
/*!40000 ALTER TABLE `alias_file_attribute` DISABLE KEYS */;
/*!40000 ALTER TABLE `alias_file_attribute` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `asset`
--

DROP TABLE IF EXISTS `asset`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `asset` (
  `id` varchar(128) NOT NULL,
  `file_type_id` int(11) unsigned DEFAULT NULL,
  `asset_type` varchar(64) NOT NULL,
  `absolute_path` varchar(1024) NOT NULL,
  `effective_dt` datetime DEFAULT CURRENT_TIMESTAMP,
  `expiration_dt` datetime DEFAULT '9999-12-31 23:59:59',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_asset_absolute_path` (`absolute_path`),
  KEY `fk_asset_file_type` (`file_type_id`),
  CONSTRAINT `fk_asset_file_type` FOREIGN KEY (`file_type_id`) REFERENCES `file_type` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `asset`
--

LOCK TABLES `asset` WRITE;
/*!40000 ALTER TABLE `asset` DISABLE KEYS */;
/*!40000 ALTER TABLE `asset` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `category`
--

DROP TABLE IF EXISTS `category`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `category` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(256) NOT NULL,
  `asset_type` varchar(128) CHARACTER SET utf8 NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=186 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `category`
--

LOCK TABLES `category` WRITE;
/*!40000 ALTER TABLE `category` DISABLE KEYS */;
INSERT INTO `category` (`id`, `name`, `asset_type`) VALUES (1,'dark classical','directory'),(2,'funk','directory'),(3,'mash-ups','directory'),(4,'rap','directory'),(5,'acid jazz','directory'),(6,'afro-beat','directory'),(7,'ambi-sonic','directory'),(8,'ambient','directory'),(9,'ambient noise','directory'),(10,'ambient soundscapes','directory'),(11,'art punk','directory'),(12,'art rock','directory'),(13,'avant-garde','directory'),(14,'black metal','directory'),(15,'blues','directory'),(16,'chamber goth','directory'),(17,'classic rock','directory'),(18,'classical','directory'),(19,'classics','directory'),(20,'contemporary classical','directory'),(21,'country','directory'),(22,'dark ambient','directory'),(23,'deathrock','directory'),(24,'deep ambient','directory'),(25,'disco','directory'),(26,'doom jazz','directory'),(27,'drum & bass','directory'),(28,'dubstep','directory'),(29,'electroclash','directory'),(30,'electronic','directory'),(31,'electronic [abstract hip-hop, illbient]','directory'),(32,'electronic [ambient groove]','directory'),(33,'electronic [armchair techno, emo-glitch]','directory'),(34,'electronic [minimal]','directory'),(35,'ethnoambient','directory'),(36,'experimental','directory'),(37,'folk','directory'),(38,'folk-horror','directory'),(39,'garage rock','directory'),(40,'goth metal','directory'),(41,'gothic','directory'),(42,'grime','directory'),(43,'gun rock','directory'),(44,'hardcore','directory'),(45,'hip-hop','directory'),(46,'hip-hop (old school)','directory'),(47,'hip-hop [chopped & screwed]','directory'),(48,'house','directory'),(49,'idm','directory'),(50,'incidental','directory'),(51,'indie','directory'),(52,'industrial','directory'),(53,'industrial rock','directory'),(54,'industrial [soundscapes]','directory'),(55,'jazz','directory'),(56,'krautrock','directory'),(57,'martial ambient','directory'),(58,'martial folk','directory'),(59,'martial industrial','directory'),(60,'modern rock','directory'),(61,'neo-folk, neo-classical','directory'),(62,'new age','directory'),(63,'new soul','directory'),(64,'new wave, synthpop','directory'),(65,'noise, powernoise','directory'),(66,'oldies','directory'),(67,'pop','directory'),(68,'post-pop','directory'),(69,'post-rock','directory'),(70,'powernoise','directory'),(71,'psychedelic rock','directory'),(72,'punk','directory'),(73,'punk [american]','directory'),(74,'rap (chopped & screwed)','directory'),(75,'rap (old school)','directory'),(76,'reggae','directory'),(77,'ritual ambient','directory'),(78,'ritual industrial','directory'),(79,'rock','directory'),(80,'roots rock','directory'),(81,'russian hip-hop','directory'),(82,'ska','directory'),(83,'soul','directory'),(84,'soundtracks','directory'),(85,'surf rock','directory'),(86,'synthpunk','directory'),(87,'trip-hop','directory'),(88,'urban','directory'),(89,'visual kei','directory'),(90,'world fusion','directory'),(91,'world musics','directory'),(92,'alternative','directory'),(93,'atmospheric','directory'),(94,'new wave','directory'),(95,'noise','directory'),(96,'synthpop','directory'),(97,'unsorted','directory'),(98,'coldwave','directory'),(99,'film music','directory'),(100,'garage punk','directory'),(101,'goth','directory'),(102,'mash-up','directory'),(103,'minimal techno','directory'),(104,'mixed','directory'),(105,'nu jazz','directory'),(106,'post-punk','directory'),(107,'psytrance','directory'),(108,'ragga soca','directory'),(109,'reggaeton','directory'),(110,'ritual','directory'),(111,'rockabilly','directory'),(112,'smooth jazz','directory'),(113,'techno','directory'),(114,'tributes','directory'),(115,'various','directory'),(116,'celebrational','directory'),(117,'classic ambient','directory'),(118,'electronic rock','directory'),(119,'electrosoul','directory'),(120,'fusion','directory'),(121,'glitch','directory'),(122,'go-go','directory'),(123,'hellbilly','directory'),(124,'illbient','directory'),(125,'industrial [rare]','directory'),(126,'jpop','directory'),(127,'mashup','directory'),(128,'minimal','directory'),(129,'modern soul','directory'),(130,'neo soul','directory'),(131,'neo-folk','directory'),(132,'new beat','directory'),(133,'satire','directory'),(134,'dark jazz','directory'),(135,'classic hip-hop','directory'),(136,'electronic dance','directory'),(137,'minimal house','directory'),(138,'minimal wave','directory'),(139,'afrobeat','directory'),(140,'heavy metal','directory'),(141,'new wave, goth, synthpop, alternative','directory'),(142,'ska, reggae','directory'),(143,'soul & funk','directory'),(144,'psychedelia','directory'),(145,'americana','directory'),(146,'dance','directory'),(147,'glam','directory'),(148,'gothic & new wave','directory'),(149,'punk & new wave','directory'),(150,'random','directory'),(151,'rock, metal, pop','directory'),(152,'sound track','directory'),(153,'soundtrack','directory'),(154,'spacerock','directory'),(155,'tribute','directory'),(156,'unclassifiable','directory'),(157,'unknown','directory'),(158,'weird','directory'),(159,'darkwave','directory'),(160,'experimental-noise','directory'),(161,'general alternative','directory'),(162,'girl group','directory'),(163,'gospel & religious','directory'),(164,'alternative & punk','directory'),(165,'bass','directory'),(166,'beat','directory'),(167,'black rock','directory'),(168,'classic','directory'),(169,'japanese','directory'),(170,'kanine','directory'),(171,'metal','directory'),(172,'moderne','directory'),(173,'noise rock','directory'),(174,'other','directory'),(175,'post-punk & minimal wave','directory'),(176,'progressive rock','directory'),(177,'psychic tv','directory'),(178,'punk & oi','directory'),(179,'radio','directory'),(180,'rock\'n\'soul','directory'),(181,'spoken word','directory'),(182,'temp','directory'),(183,'trance','directory'),(184,'vocal','directory'),(185,'world','directory');
/*!40000 ALTER TABLE `category` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `delimited_file_data`
--

DROP TABLE IF EXISTS `delimited_file_data`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `delimited_file_data` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `delimited_file_id` int(11) unsigned NOT NULL,
  `column_num` int(3) NOT NULL,
  `row_num` int(11) NOT NULL,
  `value` varchar(256) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_delimited_file_data_delimited_file_info` (`delimited_file_id`),
  CONSTRAINT `fk_delimited_file_data_delimited_file_info` FOREIGN KEY (`delimited_file_id`) REFERENCES `delimited_file_info` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `delimited_file_data`
--

LOCK TABLES `delimited_file_data` WRITE;
/*!40000 ALTER TABLE `delimited_file_data` DISABLE KEYS */;
/*!40000 ALTER TABLE `delimited_file_data` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `delimited_file_info`
--

DROP TABLE IF EXISTS `delimited_file_info`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `delimited_file_info` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `asset_id` varchar(128) NOT NULL,
  `delimiter` varchar(1) NOT NULL,
  `column_count` int(3) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `delimited_file_info`
--

LOCK TABLES `delimited_file_info` WRITE;
/*!40000 ALTER TABLE `delimited_file_info` DISABLE KEYS */;
/*!40000 ALTER TABLE `delimited_file_info` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `directory`
--

DROP TABLE IF EXISTS `directory`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `directory` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(767) NOT NULL,
  `directory_type_id` int(11) unsigned DEFAULT '1',
  `effective_dt` datetime DEFAULT CURRENT_TIMESTAMP,
  `expiration_dt` datetime DEFAULT '9999-12-31 23:59:59',
  `active_flag` tinyint(4) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_directory_name` (`name`),
  KEY `fk_directory_directory_type` (`directory_type_id`),
  CONSTRAINT `fk_directory_directory_type` FOREIGN KEY (`directory_type_id`) REFERENCES `directory_type` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=529 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `directory`
--

LOCK TABLES `directory` WRITE;
/*!40000 ALTER TABLE `directory` DISABLE KEYS */;
/*!40000 ALTER TABLE `directory` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `directory_amelioration`
--

DROP TABLE IF EXISTS `directory_amelioration`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `directory_amelioration` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(128) NOT NULL,
  `use_tag` tinyint(1) DEFAULT '0',
  `replacement_tag` varchar(32) DEFAULT NULL,
  `use_parent_folder_flag` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `directory_amelioration`
--

LOCK TABLES `directory_amelioration` WRITE;
/*!40000 ALTER TABLE `directory_amelioration` DISABLE KEYS */;
INSERT INTO `directory_amelioration` (`id`, `name`, `use_tag`, `replacement_tag`, `use_parent_folder_flag`) VALUES (1,'cd1',0,NULL,1),(2,'cd2',0,NULL,1),(3,'cd3',0,NULL,1),(4,'cd4',0,NULL,1),(5,'cd5',0,NULL,1),(6,'cd6',0,NULL,1),(7,'cd7',0,NULL,1),(8,'cd8',0,NULL,1),(9,'cd9',0,NULL,1),(10,'cd10',0,NULL,1),(11,'cd11',0,NULL,1),(12,'cd12',0,NULL,1),(13,'cd13',0,NULL,1),(14,'cd14',0,NULL,1),(15,'cd15',0,NULL,1),(16,'cd16',0,NULL,1),(17,'cd17',0,NULL,1),(18,'cd18',0,NULL,1),(19,'cd19',0,NULL,1),(20,'cd20',0,NULL,1),(21,'cd21',0,NULL,1),(22,'cd22',0,NULL,1),(23,'cd23',0,NULL,1),(24,'cd24',0,NULL,1),(25,'cd01',0,NULL,1),(26,'cd02',0,NULL,1),(27,'cd03',0,NULL,1),(28,'cd04',0,NULL,1),(29,'cd05',0,NULL,1),(30,'cd06',0,NULL,1),(31,'cd07',0,NULL,1),(32,'cd08',0,NULL,1),(33,'cd09',0,NULL,1),(34,'cd-1',0,NULL,1),(35,'cd-2',0,NULL,1),(36,'cd-3',0,NULL,1),(37,'cd-4',0,NULL,1),(38,'cd-5',0,NULL,1),(39,'cd-6',0,NULL,1),(40,'cd-7',0,NULL,1),(41,'cd-8',0,NULL,1),(42,'cd-9',0,NULL,1),(43,'cd-10',0,NULL,1),(44,'cd-11',0,NULL,1),(45,'cd-12',0,NULL,1),(46,'cd-13',0,NULL,1),(47,'cd-14',0,NULL,1),(48,'cd-15',0,NULL,1),(49,'cd-16',0,NULL,1),(50,'cd-17',0,NULL,1),(51,'cd-18',0,NULL,1),(52,'cd-19',0,NULL,1),(53,'cd-20',0,NULL,1),(54,'cd-21',0,NULL,1),(55,'cd-22',0,NULL,1),(56,'cd-23',0,NULL,1),(57,'cd-24',0,NULL,1),(58,'cd-01',0,NULL,1),(59,'cd-02',0,NULL,1),(60,'cd-03',0,NULL,1),(61,'cd-04',0,NULL,1),(62,'cd-05',0,NULL,1),(63,'cd-06',0,NULL,1),(64,'cd-07',0,NULL,1),(65,'cd-08',0,NULL,1),(66,'cd-09',0,NULL,1),(67,'disk 1',0,NULL,1),(68,'disk 2',0,NULL,1),(69,'disk 3',0,NULL,1),(70,'disk 4',0,NULL,1),(71,'disk 5',0,NULL,1),(72,'disk 6',0,NULL,1),(73,'disk 7',0,NULL,1),(74,'disk 8',0,NULL,1),(75,'disk 9',0,NULL,1),(76,'disk 10',0,NULL,1),(77,'disk 11',0,NULL,1),(78,'disk 12',0,NULL,1),(79,'disk 13',0,NULL,1),(80,'disk 14',0,NULL,1),(81,'disk 15',0,NULL,1),(82,'disk 16',0,NULL,1),(83,'disk 17',0,NULL,1),(84,'disk 18',0,NULL,1),(85,'disk 19',0,NULL,1),(86,'disk 20',0,NULL,1),(87,'disk 21',0,NULL,1),(88,'disk 22',0,NULL,1),(89,'disk 23',0,NULL,1),(90,'disk 24',0,NULL,1),(91,'disk 01',0,NULL,1),(92,'disk 02',0,NULL,1),(93,'disk 03',0,NULL,1),(94,'disk 04',0,NULL,1),(95,'disk 05',0,NULL,1),(96,'disk 06',0,NULL,1),(97,'disk 07',0,NULL,1),(98,'disk 08',0,NULL,1),(99,'disk 09',0,NULL,1);
/*!40000 ALTER TABLE `directory_amelioration` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `directory_attribute`
--

DROP TABLE IF EXISTS `directory_attribute`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `directory_attribute` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `directory_id` int(11) NOT NULL,
  `attribute_name` varchar(256) NOT NULL,
  `attribute_value` varchar(512) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `directory_attribute`
--

LOCK TABLES `directory_attribute` WRITE;
/*!40000 ALTER TABLE `directory_attribute` DISABLE KEYS */;
/*!40000 ALTER TABLE `directory_attribute` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `directory_constant`
--

DROP TABLE IF EXISTS `directory_constant`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `directory_constant` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `pattern` varchar(256) NOT NULL,
  `directory_type` varchar(64) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `directory_constant`
--

LOCK TABLES `directory_constant` WRITE;
/*!40000 ALTER TABLE `directory_constant` DISABLE KEYS */;
/*!40000 ALTER TABLE `directory_constant` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `directory_pattern`
--

DROP TABLE IF EXISTS `directory_pattern`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `directory_pattern` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `pattern` varchar(256) NOT NULL,
  `directory_type_id` int(11) unsigned DEFAULT '1',
  PRIMARY KEY (`id`),
  KEY `fk_directory_pattern_directory_type` (`directory_type_id`),
  CONSTRAINT `fk_directory_pattern_directory_type` FOREIGN KEY (`directory_type_id`) REFERENCES `directory_type` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `directory_pattern`
--

LOCK TABLES `directory_pattern` WRITE;
/*!40000 ALTER TABLE `directory_pattern` DISABLE KEYS */;
INSERT INTO `directory_pattern` (`id`, `pattern`, `directory_type_id`) VALUES (1,'/compilations',11),(2,'compilations/',11),(3,'/various',11),(4,'/bak/',1),(5,'/webcasts and custom mixes',1),(6,'/downloading',1),(7,'/live',1),(8,'/slsk/',1),(9,'/incoming/',37),(10,'/random',42),(11,'/recently',33),(12,'/unsorted',31),(13,'[...]',38),(14,'albums',10),(15,'noscan',29);
/*!40000 ALTER TABLE `directory_pattern` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `directory_type`
--

DROP TABLE IF EXISTS `directory_type`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `directory_type` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `desc` varchar(255) DEFAULT NULL,
  `name` varchar(25) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_directory_type` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=43 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `directory_type`
--

LOCK TABLES `directory_type` WRITE;
/*!40000 ALTER TABLE `directory_type` DISABLE KEYS */;
INSERT INTO `directory_type` (`id`, `desc`, `name`) VALUES (1,NULL,'default'),(2,NULL,'owner'),(3,NULL,'user'),(4,NULL,'location'),(5,NULL,'format'),(6,NULL,'collection'),(7,NULL,'category'),(8,NULL,'genre'),(9,NULL,'artist'),(10,NULL,'album'),(11,NULL,'compilation'),(12,NULL,'single'),(13,NULL,'producer'),(14,NULL,'label'),(15,NULL,'actor'),(16,NULL,'directory'),(17,NULL,'movie'),(18,NULL,'series'),(19,NULL,'show'),(20,NULL,'author'),(21,NULL,'book'),(22,NULL,'speaker'),(23,NULL,'presentation'),(24,NULL,'radio'),(25,NULL,'broadcast'),(26,NULL,'incoming'),(27,NULL,'video'),(28,NULL,'audio'),(29,NULL,'expunged'),(30,NULL,'path'),(31,NULL,'unsorted'),(32,NULL,'discography'),(33,NULL,'recent'),(34,NULL,'vintage'),(35,NULL,'current'),(36,NULL,'temp'),(37,NULL,'download'),(38,NULL,'side project'),(39,NULL,'solo'),(40,NULL,'debut'),(41,NULL,'play'),(42,NULL,'random');
/*!40000 ALTER TABLE `directory_type` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `file_attribute`
--

DROP TABLE IF EXISTS `file_attribute`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `file_attribute` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `file_encoding_id` int(11) unsigned NOT NULL,
  `attribute_name` varchar(128) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_file_attribute` (`file_encoding_id`,`attribute_name`),
  KEY `fk_file_attribute_file_encoding` (`file_encoding_id`),
  CONSTRAINT `fk_file_attribute_file_encoding` FOREIGN KEY (`file_encoding_id`) REFERENCES `file_encoding` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=1192 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `file_attribute`
--

LOCK TABLES `file_attribute` WRITE;
/*!40000 ALTER TABLE `file_attribute` DISABLE KEYS */;
/*!40000 ALTER TABLE `file_attribute` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `file_encoding`
--

DROP TABLE IF EXISTS `file_encoding`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `file_encoding` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(25) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_file_encoding` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=112 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `file_encoding`
--

LOCK TABLES `file_encoding` WRITE;
/*!40000 ALTER TABLE `file_encoding` DISABLE KEYS */;
/*!40000 ALTER TABLE `file_encoding` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `file_handler`
--

DROP TABLE IF EXISTS `file_handler`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `file_handler` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `package_name` varchar(128) DEFAULT NULL,
  `module_name` varchar(128) NOT NULL,
  `class_name` varchar(128) DEFAULT NULL,
  `active_flag` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `file_handler`
--

LOCK TABLES `file_handler` WRITE;
/*!40000 ALTER TABLE `file_handler` DISABLE KEYS */;
INSERT INTO `file_handler` (`id`, `package_name`, `module_name`, `class_name`, `active_flag`) VALUES (1,NULL,'pathogen','MutagenAAC',0),(2,NULL,'pathogen','MutagenAPEv2',1),(3,NULL,'pathogen','MutagenFLAC',1),(4,NULL,'pathogen','MutagenID3',1),(5,NULL,'pathogen','MutagenMP4',1),(6,NULL,'pathogen','MutagenOggFlac',0),(7,NULL,'pathogen','MutagenOggVorbis',1),(8,NULL,'funambulist','PyPDF2FileHandler',1);
/*!40000 ALTER TABLE `file_handler` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `file_handler_registration`
--

DROP TABLE IF EXISTS `file_handler_registration`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `file_handler_registration` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(128) NOT NULL,
  `file_handler_id` int(11) unsigned NOT NULL,
  `file_type_id` int(11) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_file_handler_file_type` (`file_type_id`),
  KEY `fk_file_handler_registration_file_handler` (`file_handler_id`),
  CONSTRAINT `fk_file_handler_file_type` FOREIGN KEY (`file_type_id`) REFERENCES `file_type` (`id`),
  CONSTRAINT `fk_file_handler_registration_file_handler` FOREIGN KEY (`file_handler_id`) REFERENCES `file_handler` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `file_handler_registration`
--

LOCK TABLES `file_handler_registration` WRITE;
/*!40000 ALTER TABLE `file_handler_registration` DISABLE KEYS */;
INSERT INTO `file_handler_registration` (`id`, `name`, `file_handler_id`, `file_type_id`) VALUES (1,'mutagen-aac',1,3),(2,'mutagen-ape',2,4),(3,'mutagen-mpc',2,10),(4,'mutagen-flac',3,5),(5,'mutagen-id3-mp3',4,11),(6,'mutagen-id3-flac',4,5),(7,'mutagen-mp4',5,16),(8,'mutagen-m4a',5,9),(9,'mutagen-ogg',6,6),(10,'mutagen-ogg-flac',6,5),(11,'mutagen-ogg-vorbis',7,6),(12,'mutagen-ogg-oga',7,7),(13,'pypdf2',8,13);
/*!40000 ALTER TABLE `file_handler_registration` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `file_type`
--

DROP TABLE IF EXISTS `file_type`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `file_type` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `desc` varchar(255) DEFAULT NULL,
  `ext` varchar(11) DEFAULT NULL,
  `name` varchar(25) DEFAULT NULL,
  `is_binary` tinyint(4) DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_file_type` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=134 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `file_type`
--

LOCK TABLES `file_type` WRITE;
/*!40000 ALTER TABLE `file_type` DISABLE KEYS */;
INSERT INTO `file_type` (`id`, `desc`, `ext`, `name`, `is_binary`) VALUES (1,NULL,NULL,'directory',0),(2,NULL,'*','wildcard',0),(3,NULL,'aac','aac',1),(4,NULL,'ape','ape',1),(5,NULL,'flac','flac',1),(6,NULL,'ogg','ogg',1),(7,NULL,'oga','oga',1),(8,NULL,'iso','iso',1),(9,NULL,'m4a','m4a',1),(10,NULL,'mpc','mpc',1),(11,NULL,'mp3','mp3',1),(12,NULL,'wav','wav',1),(13,NULL,'pdf','pdf',1),(14,NULL,'txt','txt',0),(15,NULL,'jpg','jpg',1),(16,NULL,'mp4','mp4',1),(17,NULL,'avi','avi',1),(18,NULL,'mkv','mkv',1),(19,NULL,'url','url',0),(20,NULL,'tif','tif',1),(21,NULL,'png','png',1),(22,NULL,'sls','sls',0),(23,NULL,'nfo','nfo',0),(24,NULL,'ewyu8s','ewyu8s',0),(25,NULL,'mxm','mxm',1),(26,NULL,'jpeg','jpeg',1),(27,NULL,'ini','ini',0),(28,NULL,'gif','gif',1),(29,NULL,'xspf','xspf',0),(30,NULL,'xml','xml',0),(31,NULL,'conf','conf',0),(32,NULL,'bmp','bmp',1),(33,NULL,'lnk','lnk',1),(34,NULL,'docx','docx',1),(35,NULL,'sh','sh',0),(36,NULL,'html','html',0),(37,NULL,'xlsx','xlsx',1),(38,NULL,'rtf','rtf',1),(39,NULL,'mhtml','mhtml',0),(40,NULL,'rdp','rdp',0),(41,NULL,'sql','sql',0),(42,NULL,'css','css',0),(43,NULL,'download','download',0),(44,NULL,'zip','zip',1),(45,NULL,'cshtml','cshtml',0),(46,NULL,'bak','bak',0),(47,NULL,'cs','cs',0),(48,NULL,'old','old',0),(49,NULL,'config','config',0),(50,NULL,'log','log',0),(51,NULL,'xsl','xsl',0),(52,NULL,'htm','htm',0),(53,NULL,'dll','dll',1),(54,NULL,'bin','bin',1),(55,NULL,'ps1xml','ps1xml',0),(56,NULL,'psd1','psd1',0),(57,NULL,'ps1','ps1',0),(58,NULL,'groovy','groovy',0),(59,NULL,'yml','yml',0),(60,NULL,'md','md',0),(61,NULL,'json','json',0),(62,NULL,'sln','sln',0),(63,NULL,'git/head','git/head',0),(64,NULL,'sample','sample',0),(65,NULL,'suo','suo',1),(66,NULL,'ide','ide',1),(67,NULL,'ide-shm','ide-shm',1),(68,NULL,'ide-wal','ide-wal',1),(69,NULL,'csproj','csproj',0),(70,NULL,'pdb','pdb',1),(71,NULL,'cache','cache',0),(72,NULL,'props','props',0),(73,NULL,'targets','targets',0),(74,NULL,'idx','idx',1),(75,NULL,'pack','pack',1),(76,NULL,'lock','lock',0),(77,NULL,'bowerrc','bowerrc',0),(78,NULL,'user','user',0),(79,NULL,'ico','ico',1),(80,NULL,'svg','svg',0),(81,NULL,'eot','eot',1),(82,NULL,'ttf','ttf',1),(83,NULL,'woff','woff',1),(84,NULL,'woff2','woff2',1),(85,NULL,'less','less',0),(86,NULL,'js','js',0),(87,NULL,'map','map',0),(88,NULL,'jshintrc','jshintrc',0),(89,NULL,'jscsrc','jscsrc',0),(90,NULL,'nuspec','nuspec',0),(91,NULL,'ds_store','ds_store',1),(92,NULL,'py','py',0),(93,NULL,'git','git',0),(94,NULL,'project','project',0),(95,NULL,'gradle','gradle',0),(96,NULL,'bat','bat',0),(97,NULL,'prefs','prefs',0),(98,NULL,'jar','jar',1),(99,NULL,'gz','gz',1),(100,NULL,'policy','policy',0),(101,NULL,'xsd','xsd',0),(102,NULL,'java','java',0),(103,NULL,'mf','mf',0),(104,NULL,'class','class',1),(105,NULL,'scss','scss',0),(106,NULL,'oqsl','oqsl',0),(107,NULL,'java~','java~',0),(108,NULL,'fxml','fxml',0),(109,NULL,'in','in',0),(110,NULL,'license','license',0),(111,NULL,'ftl','ftl',0),(112,NULL,'gsp','gsp',0),(113,NULL,'g','g',0),(114,NULL,'tokens','tokens',0),(115,NULL,'bnf','bnf',0),(116,NULL,'yaml','yaml',0),(117,NULL,'version','version',0),(118,NULL,'swf','swf',1),(119,NULL,'script','script',0),(120,NULL,'lib','lib',1),(121,NULL,'pyc','pyc',1),(122,NULL,'iml','iml',0),(123,NULL,'otf','otf',1),(124,NULL,'itdb','itdb',1),(125,NULL,'itl','itl',1),(126,NULL,'itc2','itc2',1),(127,NULL,'plist','plist',0),(128,NULL,'m4v','m4v',1),(129,NULL,'m4p','m4p',1),(130,NULL,'cbr','cbr',1),(131,NULL,'info','info',0),(132,NULL,'m3u','m3u',0),(133,NULL,'cue','cue',0);
/*!40000 ALTER TABLE `file_type` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `match_record`
--

DROP TABLE IF EXISTS `match_record`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `match_record` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `doc_id` varchar(128) NOT NULL,
  `match_doc_id` varchar(128) NOT NULL,
  `matcher_name` varchar(128) NOT NULL,
  `is_ext_match` tinyint(1) NOT NULL DEFAULT '0',
  `score` float DEFAULT NULL,
  `max_score` float DEFAULT NULL,
  `min_score` float DEFAULT NULL,
  `comparison_result` char(1) CHARACTER SET utf8 NOT NULL,
  `file_parent` varchar(256) DEFAULT NULL,
  `file_name` varchar(256) DEFAULT NULL,
  `match_parent` varchar(256) DEFAULT NULL,
  `match_file_name` varchar(256) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_match_doc_asset` (`match_doc_id`),
  KEY `fk_doc_asset` (`doc_id`),
  CONSTRAINT `fk_doc_asset` FOREIGN KEY (`doc_id`) REFERENCES `asset` (`id`),
  CONSTRAINT `fk_match_doc_asset` FOREIGN KEY (`match_doc_id`) REFERENCES `asset` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `match_record`
--

LOCK TABLES `match_record` WRITE;
/*!40000 ALTER TABLE `match_record` DISABLE KEYS */;
/*!40000 ALTER TABLE `match_record` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `matcher`
--

DROP TABLE IF EXISTS `matcher`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `matcher` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(128) NOT NULL,
  `query_type` varchar(64) NOT NULL,
  `max_score_percentage` float NOT NULL DEFAULT '0',
  `applies_to_file_type` varchar(6) CHARACTER SET utf8 NOT NULL DEFAULT '*',
  `active_flag` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `matcher`
--

LOCK TABLES `matcher` WRITE;
/*!40000 ALTER TABLE `matcher` DISABLE KEYS */;
INSERT INTO `matcher` (`id`, `name`, `query_type`, `max_score_percentage`, `applies_to_file_type`, `active_flag`) VALUES (1,'filename_match_matcher','match',75,'*',1),(2,'tag_term_matcher_artist_album_song','term',0,'*',0),(3,'filesize_term_matcher','term',0,'flac',0),(4,'artist_matcher','term',0,'*',0),(5,'match_artist_album_song','match',75,'*',1);
/*!40000 ALTER TABLE `matcher` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `matcher_field`
--

DROP TABLE IF EXISTS `matcher_field`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `matcher_field` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `matcher_id` int(11) unsigned NOT NULL,
  `field_name` varchar(128) NOT NULL,
  `boost` float NOT NULL DEFAULT '0',
  `bool_` varchar(16) DEFAULT NULL,
  `operator` varchar(16) DEFAULT NULL,
  `minimum_should_match` float NOT NULL DEFAULT '0',
  `analyzer` varchar(64) DEFAULT NULL,
  `query_section` varchar(128) CHARACTER SET utf8 DEFAULT 'should',
  `default_value` varchar(128) CHARACTER SET utf8 DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_matcher_field_matcher` (`matcher_id`),
  CONSTRAINT `fk_matcher_field_matcher` FOREIGN KEY (`matcher_id`) REFERENCES `matcher` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `matcher_field`
--

LOCK TABLES `matcher_field` WRITE;
/*!40000 ALTER TABLE `matcher_field` DISABLE KEYS */;
INSERT INTO `matcher_field` (`id`, `matcher_id`, `field_name`, `boost`, `bool_`, `operator`, `minimum_should_match`, `analyzer`, `query_section`, `default_value`) VALUES (1,2,'attributes.TPE1',5,NULL,NULL,0,NULL,'should',NULL),(2,2,'attributes.TIT2',7,NULL,NULL,0,NULL,'should',NULL),(3,2,'attributes.TALB',3,NULL,NULL,0,NULL,'should',NULL),(4,1,'file_name',0,NULL,NULL,0,NULL,'should',NULL),(5,2,'deleted',0,NULL,NULL,0,NULL,'should',NULL),(6,3,'file_size',3,NULL,NULL,0,NULL,'should',NULL),(7,4,'attributes.TPE1',3,NULL,NULL,0,NULL,'should',NULL),(8,5,'attributes.TPE1',0,NULL,NULL,0,NULL,'must',NULL),(9,5,'attributes.TIT2',5,NULL,NULL,0,NULL,'should',NULL),(10,5,'attributes.TALB',0,NULL,NULL,0,NULL,'should',NULL),(11,5,'deleted',0,NULL,NULL,0,NULL,'must_not','true'),(12,5,'attributes.TRCK',0,NULL,NULL,0,NULL,'should',''),(13,5,'attributes.TPE2',0,NULL,NULL,0,NULL,'','should');
/*!40000 ALTER TABLE `matcher_field` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Temporary table structure for view `v_match_record`
--

DROP TABLE IF EXISTS `v_match_record`;
/*!50001 DROP VIEW IF EXISTS `v_match_record`*/;
SET @saved_cs_client     = @@character_set_client;
SET character_set_client = utf8;
/*!50001 CREATE VIEW `v_match_record` AS SELECT 
 1 AS `asset_path`,
 1 AS `comparison_result`,
 1 AS `match_path`,
 1 AS `is_ext_match`*/;
SET character_set_client = @saved_cs_client;

--
-- Dumping routines for database 'media'
--

--
-- Final view structure for view `v_match_record`
--

/*!50001 DROP VIEW IF EXISTS `v_match_record`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8 */;
/*!50001 SET character_set_results     = utf8 */;
/*!50001 SET collation_connection      = utf8_general_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `v_match_record` AS select `d1`.`absolute_path` AS `asset_path`,`m`.`comparison_result` AS `comparison_result`,`d2`.`absolute_path` AS `match_path`,`m`.`is_ext_match` AS `is_ext_match` from ((`asset` `d1` join `asset` `d2`) join `match_record` `m`) where ((`m`.`doc_id` = `d1`.`id`) and (`m`.`match_doc_id` = `d2`.`id`)) union select `d2`.`absolute_path` AS `asset_path`,`m`.`comparison_result` AS `comparison_result`,`d1`.`absolute_path` AS `match_path`,`m`.`is_ext_match` AS `is_ext_match` from ((`asset` `d1` join `asset` `d2`) join `match_record` `m`) where ((`m`.`doc_id` = `d2`.`id`) and (`m`.`match_doc_id` = `d1`.`id`)) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed
