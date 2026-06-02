create or replace function public.notify_admins_email_failure()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exists boolean;
begin
  if NEW.status not in ('failed','dlq','bounced','complained') then
    return NEW;
  end if;

  begin
    if NEW.message_id is not null then
      select exists(
        select 1 from public.notifications
        where type = 'email_failed'
          and data->>'message_id' = NEW.message_id
      ) into v_exists;
      if v_exists then
        return NEW;
      end if;
    end if;

    insert into public.notifications (user_id, type, title, body, link, priority, data)
    select ur.user_id,
           'email_failed',
           '✉️ Email delivery failed',
           format(
             '%s → %s · %s',
             NEW.template_name,
             NEW.recipient_email,
             coalesce(nullif(NEW.error_message, ''), 'Unknown error')
           ),
           '/admin-email-health',
           'important',
           jsonb_build_object(
             'message_id', NEW.message_id,
             'template_name', NEW.template_name,
             'recipient', NEW.recipient_email,
             'reason', NEW.error_message,
             'status', NEW.status,
             'failed_at', NEW.created_at
           )
    from public.user_roles ur
    where ur.role in ('admin','super_admin');
  exception when others then
    -- Never let notification failures roll back the email log insert.
    raise warning 'notify_admins_email_failure failed: %', sqlerrm;
  end;

  return NEW;
end;
$$;