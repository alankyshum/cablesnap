## ⚠️ One-time reinstall required

This is the first CableSnap release signed with our new persistent production
keystore (BLD-484 / BLD-485). Earlier releases were signed with a throwaway
debug key that changed every CI run, which is why F-Droid kept asking you to
uninstall and reinstall on every update.

**Action required for existing users:** uninstall the old CableSnap before
installing this version. Your workout, template, and nutrition data lives in
the app's private storage and will be cleared by the uninstall — export any
data you care about from Settings first.

**After this release:** all future updates will install cleanly in-place. No
more reinstall dance.
