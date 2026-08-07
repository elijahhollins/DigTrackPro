-- Adds tickets.updated_at so the offline write queue can detect conflicts.
--
-- When a ticket edit is made offline and replayed later, we need to know whether anyone changed
-- that ticket in the meantime. Without this column the queue can only clobber blindly.
--
-- Tickets are the one entity where that matters enough to check: this is utility locating, and
-- silently overwriting somebody's refresh request or no-show report loses safety-relevant
-- information. Everything else in the queue is last-write-wins, matching what the database
-- already does.

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Backfill existing rows to their creation time rather than "now", so a ticket that has not been
-- touched since it was created does not look like it was just modified.
UPDATE public.tickets
  SET updated_at = COALESCE(created_at, now())
  WHERE updated_at IS NULL OR updated_at = created_at IS NOT TRUE;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tickets_set_updated_at ON public.tickets;

-- A trigger rather than relying on the client to send the column: the whole point is to detect
-- writes the client did not make, so the database has to be the one stamping it.
CREATE TRIGGER tickets_set_updated_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS tickets_updated_at_idx ON public.tickets (updated_at);
