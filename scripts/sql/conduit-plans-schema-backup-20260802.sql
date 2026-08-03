--
-- PostgreSQL database dump
--

\restrict 4WudMJxqV3YOHG8iP3X9QvjuW7Iovith9N6or86I5FVnGci9qdNxT1GhyshJObj

-- Dumped from database version 17.10 (Debian 17.10-1.pgdg12+1)
-- Dumped by pg_dump version 17.10 (Debian 17.10-0+deb13u1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: plans; Type: TABLE; Schema: conduit; Owner: pguser
--

CREATE TABLE conduit.plans (
    id text NOT NULL,
    file_name text NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    project text DEFAULT ''::text NOT NULL,
    goal text DEFAULT ''::text NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    files_affected text DEFAULT '[]'::text NOT NULL,
    acceptance_criteria text DEFAULT '[]'::text NOT NULL,
    dependencies text DEFAULT '[]'::text NOT NULL,
    prompt_ref text DEFAULT ''::text NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    deleted integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE conduit.plans OWNER TO pguser;

--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: conduit; Owner: pguser
--

ALTER TABLE ONLY conduit.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);


--
-- Name: idx_plans_status; Type: INDEX; Schema: conduit; Owner: pguser
--

CREATE INDEX idx_plans_status ON conduit.plans USING btree (updated_at);


--
-- PostgreSQL database dump complete
--

\unrestrict 4WudMJxqV3YOHG8iP3X9QvjuW7Iovith9N6or86I5FVnGci9qdNxT1GhyshJObj

