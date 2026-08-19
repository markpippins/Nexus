--
-- PostgreSQL database dump
--

\restrict sU17xnCNc5PRSlfiVRg0XFHu9aDWDaYlc2Hs8eo3db96XtPPWygLvYbmRHflUa6

-- Dumped from database version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: vision; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA vision;


ALTER SCHEMA vision OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: work_requests; Type: TABLE; Schema: vision; Owner: postgres
--

CREATE TABLE vision.work_requests (
    id uuid NOT NULL,
    work_request_uuid text,
    status text DEFAULT 'pending'::text NOT NULL,
    nexus_work_request_id text
);


ALTER TABLE vision.work_requests OWNER TO postgres;

--
-- PostgreSQL database dump complete
--

\unrestrict sU17xnCNc5PRSlfiVRg0XFHu9aDWDaYlc2Hs8eo3db96XtPPWygLvYbmRHflUa6

--
-- PostgreSQL database dump
--

\restrict Ptw4TNAdnwsWZU0S75kTYRJXgrq6xoK1ZGbTd62bLNlRQBoWKg1MR60KGR2gXG4

-- Dumped from database version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: work_requests; Type: TABLE DATA; Schema: vision; Owner: postgres
--

INSERT INTO vision.work_requests (id, work_request_uuid, status, nexus_work_request_id) VALUES ('df998001-b8d6-4d9e-8c55-97e32c345841', 'workrequest:wr-mongo-wiring', 'APPROVED', '90000000-0000-0000-0000-000000000002');


--
-- PostgreSQL database dump complete
--

\unrestrict Ptw4TNAdnwsWZU0S75kTYRJXgrq6xoK1ZGbTd62bLNlRQBoWKg1MR60KGR2gXG4

