SELECT conname, conrelid::regclass AS table_name, pg_get_constraintdef(oid) AS constraint_def FROM pg_constraint WHERE contype = 'f' AND conrelid::regclass = 'file_shares'::regclass;
