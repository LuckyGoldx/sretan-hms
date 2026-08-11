-- Seed test insurance staff user
-- Password: insurance (bcrypt hash)
INSERT INTO insurance_staff_users (id, tenant_id, provider_id, full_name, email, phone, password_hash, role, access_scope, is_active)
SELECT * FROM (VALUES
  ('b0000000-0000-0000-0000-000000000001'::uuid,
   '00000000-0000-0000-0000-000000000000'::uuid,
   (SELECT id FROM insurance_providers WHERE code = 'GPHMO'),
   'Insurance Admin',
   'insurance@sretan.com',
   '0800000000',
   '$2b$10$QkJIoTHjUqUfwIuhANy4fu/1LqD4NTHfdc6rDl7WPJEnVzawp7hde',
   'admin',
   'own',
   true)
) AS v(id, tenant_id, provider_id, full_name, email, phone, password_hash, role, access_scope, is_active)
WHERE NOT EXISTS (SELECT 1 FROM insurance_staff_users WHERE email = v.email);
