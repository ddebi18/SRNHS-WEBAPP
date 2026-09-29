-- =============================================================================
-- SMS Notifications — Staff Read Policy
-- Allows authenticated staff with admin role to inspect dispatched SMS logs.
-- =============================================================================

DROP POLICY IF EXISTS "sms_admin_select" ON public.sms_notifications;
CREATE POLICY "sms_admin_select" ON public.sms_notifications
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      WHERE sp.id = auth.uid() AND sp.role = 'admin'
    )
  );
