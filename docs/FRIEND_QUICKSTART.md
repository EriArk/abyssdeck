# Join an existing AbyssDeck Hub

This guide is for an invited member, not for installing a new Hub. Use the Hub
address and invitations supplied by its administrator. The maintainer's private
installation is not a public registration service.

## Before starting

You need your own Hub account and a Windows PC you control. The administrator
must arrange a private route from the Hub to that PC, usually through Tailscale.
A Hub invitation and a network invitation are separate; neither grants access
to someone else's native AI accounts or projects.

## Administrator

1. Create a member invitation in the Hub's access settings and send it privately.
2. Arrange the approved private network connection and required network policy.
3. After PC setup, compare its displayed fingerprint with the enrollment record.
4. Approve the intended member/device and verify connectivity before activation.

Keep invitation URLs and connection keys out of issues, screenshots and Git.
Existing installation-owner connections retain their configured route; do not
re-enroll or replace them while adding a member.

## Member

1. Open the Hub invitation and create your own login/password.
2. Follow its connection wizard. On the PC, download the enrollment package,
   extract it and run `Connect.cmd` as instructed. Complete requested Windows
   elevation and personal sign-ins yourself.
3. Connect the PC to the administrator's approved network. Signing into an
   unrelated personal Tailnet does not connect it to this Hub.
4. Choose your project folders and optional desktop integration. Wait for device
   approval, then activate the verified connection.
5. Complete any optional personal GPT setup offered by the Hub. Each person uses
   their own native account; a GPT login must not be mistaken for PC enrollment.

Resume an interrupted setup from the Hub's account/connection settings. Keep the
PC on and connected while work runs on it. A phone/tablet only needs access to
its Hub URL; whether that requires VPN depends on the installation's ingress.

See [Windows enrollment](WINDOWS_ENROLLMENT.md) for the transport and approval
contract, [Companion](COMPANION_APP.md) for component setup, and
[deployment](DEPLOYMENT.md) for administering a separate installation. Available
components and installation evidence are version-specific; this guide is not a
claim that every fresh PC or Linux installation has been verified.
