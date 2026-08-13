CREATE TABLE public.user_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, department_id)
);

GRANT SELECT ON public.user_departments TO authenticated;
GRANT ALL ON public.user_departments TO service_role;

ALTER TABLE public.user_departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read user departments"
  ON public.user_departments FOR SELECT TO authenticated USING (true);

CREATE POLICY "admins manage user departments"
  ON public.user_departments FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

INSERT INTO public.user_departments (user_id, department_id)
SELECT id, department_id FROM public.profiles WHERE department_id IS NOT NULL
ON CONFLICT DO NOTHING;