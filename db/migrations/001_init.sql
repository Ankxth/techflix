CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  github_id TEXT UNIQUE,
  name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  github_url TEXT,
  level INT,
  category TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evaluations (
  id SERIAL PRIMARY KEY,
  project_id INT REFERENCES projects(id),
  run_1_score FLOAT,
  run_2_score FLOAT,
  run_3_score FLOAT,
  consensus_score FLOAT,
  confidence_pct FLOAT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scores (
  id SERIAL PRIMARY KEY,
  evaluation_id INT REFERENCES evaluations(id),
  metric_name TEXT,
  raw_score FLOAT,
  weighted_score FLOAT,
  severity TEXT
);

CREATE TABLE IF NOT EXISTS rankings (
  id SERIAL PRIMARY KEY,
  project_id INT REFERENCES projects(id),
  level INT,
  category TEXT,
  percentile FLOAT,
  peer_count INT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS code_metrics (
  id SERIAL PRIMARY KEY,
  project_id INT REFERENCES projects(id),
  loc INT,
  complexity FLOAT,
  duplication_pct FLOAT,
  coverage_pct FLOAT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integrity_flags (
  id SERIAL PRIMARY KEY,
  project_id INT,
  plagiarism_score FLOAT,
  ai_gen_flag BOOLEAN,
  security_issues JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY,
  evaluation_id TEXT,
  pdf_url TEXT,
  json_url TEXT,
  learning_path JSONB,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);
