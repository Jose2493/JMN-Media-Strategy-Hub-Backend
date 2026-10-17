# Design Studio authorization review

## Incident and diagnosis

The reported TEST workspace exposure occurred at the production hostname
`jmn-media-strategy-hub-backend.vercel.app`. Production deployment metadata
identified main commit `643ff2efb7504cb0cf777894f3ec12376a422eea`.
Production data, environment settings and application deployment were not changed.

The original incident root cause was a fixed/shared QA bootstrap in SuiteDash,
as confirmed by the operator after the initial investigation. SuiteDash production
wiring has already been corrected to dynamic per-client authentication. TEST now
resolves to its own company, has no Semper grant and receives access denied.
The operator confirmed exactly one legitimate Semper CrossFit grant for
`semper-athlete-shirt-01`, revocation of the exposed/shared QA bootstrap, failure
of the old bootstrap exchange, and preservation of other contacts and grants.
These are operator-confirmed production checks; this branch does not change
production data or identity wiring.

The original source already checked the signed session company, active template
and `design_template_access` before returning template metadata. A shared valid
bootstrap supplied another identity to that check. This PR adds defense in depth
without changing bootstrap/session contracts or relying on SuiteDash menus.

Confirmed gaps were protected template configuration/editor markup embedded in
the public HTML, signed asset URLs usable independently of the current session
for their remaining lifetime, and browser-only exports without an independent
server authorization check. These gaps are addressed here; they should not be
represented as proof of the reported incident's precise cause.

## Request flow and enforcement

The existing bootstrap exchange and session contract are unchanged. The generic
public shell clears the bootstrap fragment, exchanges it, and requests the
template with the returned session. Protected markup, configuration and renderer
are returned only after authorization; they are no longer public static content.

Template, asset and export handlers use the shared session verifier. Each request
checks that the contact still belongs to the signed company, that the supported
template is active, and that an exact company/template grant exists. No caller
company identifier is used for ownership. Unknown query/body ownership fields
are rejected. Denied or missing templates share a neutral response.

Private image bytes are proxied through the authorized asset endpoint, with safe
relative paths, fixed asset keys and a mandatory private bucket. No signed
storage capability is returned. Export rechecks the same authorization before
accepting a bounded PNG and returning an attachment. It does not prevent an
already authorized user from retaining pixels previously downloaded or rendered.
Responses are private and not cached. Session expiry clears the client editor.

## Validation and limits

Against staging `aladurkcrzyczjtpdpjc`, two isolated fictional identities modeled
an authorized Semper workspace and an unauthorized TEST workspace. No actual
customer template or production identity was accessed. Both bootstrap exchanges
passed. Authorized metadata, image integrity and PNG export passed. TEST metadata,
direct template URL, assets and export were denied. Ownership overrides, inactive
templates, unauthenticated requests and public legacy asset paths were denied.
Automated tests additionally cover grant revocation, unsafe paths, public buckets,
contact mismatch, session verification, neutral denial and late client responses.

The authorized browser editor rendered with editing and download controls enabled;
the TEST browser showed only the unavailable state with no protected controls or
content. Browser download-event automation timed out, so a completed browser file
download is not claimed. Direct authenticated HTTP export returned matching bytes.

Full suite: 190 passed, 0 failed, 1 skipped (optional environment-dependent media
test). JavaScript syntax checks passed for 81 files. Diff whitespace check passed.
The sandbox-only first suite attempt could not connect to its local uploader test
server; rerunning with loopback access passed.

All temporary staging identities, grants, template, image objects and token files
were removed. The temporary exception on the isolated QA Preview was revoked and
normal protection returned HTTP 302. SuiteDash configuration was not modified.

The authorization changes are ready for review and merge consideration. Live
Abel/Semper client-session verification remains a separate beta preflight item,
not a merge blocker. Verify that Abel enters through the dynamic SuiteDash link,
resolves to the legitimate Semper company, loads the intended template and can
export successfully. A completed browser download remains part of that preflight.
