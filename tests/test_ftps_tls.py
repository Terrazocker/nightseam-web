"""Real, offline FTPS handshakes must authenticate peers before credentials.

The public test-only key/certificate below identify localhost and are valid from
2000 to 2099. They are not production credentials. MemoryBIO handshakes avoid sockets,
DNS, external services, openssl and extra Python dependencies during tests.
"""
from contextlib import contextmanager
from pathlib import Path
import socket
import ssl
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "web"))
import ftps_deploy

_CERTIFICATE = """-----BEGIN CERTIFICATE-----
MIIDEjCCAfqgAwIBAgIBATANBgkqhkiG9w0BAQsFADAUMRIwEAYDVQQDDAlsb2Nh
bGhvc3QwIBcNMDAwMTAxMDAwMDAwWhgPMjA5OTAxMDEwMDAwMDBaMBQxEjAQBgNV
BAMMCWxvY2FsaG9zdDCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBALME
zjziEt99LzdB3XiLqb8V2sPdHGAO9yqKCrQSQgdZVIuWUhLDOYgKH/zXHO8cxG0E
BmpKJ4UjnovfPQSt8f2gLkr+AfopqKaydcHyeXJ24rfxzKj7iQqXOh5lWQTqWt4U
FX/ICjzTs1dGz7sSAoaxGIGnWeBmN8SDZqbmMAXZc3aRZZLyJJpWmBIDf3OGNeyJ
Bb5Bdeo/zyUFkj0PfVUIN0fRZr8x3kB7sFhx5Ah9OfAIbFYQVw3s8WGMc7XBcBoJ
Hc1J8qB2+BR2bzZSkYBQx+hsZgi87kVdXwgkAPWeY9/1tuUj6O7EejibSM2sM/sJ
tgSlRISihkLoDizZXFUCAwEAAaNtMGswDwYDVR0TAQH/BAUwAwEB/zAOBgNVHQ8B
Af8EBAMCAqQwEwYDVR0lBAwwCgYIKwYBBQUHAwEwFAYDVR0RBA0wC4IJbG9jYWxo
b3N0MB0GA1UdDgQWBBQI2O1+ADIY6Ero20+cdJyvKk8EOTANBgkqhkiG9w0BAQsF
AAOCAQEAio3t8La+Wrs4h4vqROwm9uhxr3wWztOw4Ka4JuF3HXf9s5zqGp9isOs/
N06z/rUTbjQad8eyHnseGx+c6uad0fXz+5SNnv8zk+17heysUiPvSGfAfHDNlu52
OweueTJT4CY04bXTGFs0W0ay1U4gXwRs2PSp8XQRDzxnXbpGPsLJNA59l/YJtHGx
Ph/l9KTpCGuvv1QlYqDxHIKObHfNedpYC/Ynn6zUL3bYU1/KdiKPXx7V7nE3duIj
TtaQq74rVT8d7+rkmwzC7Z1V/bedv1VmrWBVR/XS9QO2AEhB5BI3pbgaPmBLUuif
5URLRSOgoTjMgUGclLzAAzxhMhpFwA==
-----END CERTIFICATE-----
"""

_TEST_KEY = """-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCzBM484hLffS83
Qd14i6m/FdrD3RxgDvcqigq0EkIHWVSLllISwzmICh/81xzvHMRtBAZqSieFI56L
3z0ErfH9oC5K/gH6KaimsnXB8nlyduK38cyo+4kKlzoeZVkE6lreFBV/yAo807NX
Rs+7EgKGsRiBp1ngZjfEg2am5jAF2XN2kWWS8iSaVpgSA39zhjXsiQW+QXXqP88l
BZI9D31VCDdH0Wa/Md5Ae7BYceQIfTnwCGxWEFcN7PFhjHO1wXAaCR3NSfKgdvgU
dm82UpGAUMfobGYIvO5FXV8IJAD1nmPf9bblI+juxHo4m0jNrDP7CbYEpUSEooZC
6A4s2VxVAgMBAAECggEAAb8TkgcF605gbbQlzKQGJ71FEZZSiogCJeW1nE3RmQ9t
6hhjPaXxc5LDMO2dCU9MlprBb9S6u4MK0xkJYyT7652xinDPjRr6vPCd0CV/h/UP
y/OnR3/TjptcFztzX+Y8/V56ov7o5r6jkSw8P55jdQdsZ2CGbQgGExlGlct4Outn
xnnaK/fOrkTNCuiU21IEPeE1CqbV8MOokKrQbZmj/F31XDiETSda0opl8Z+8WK8N
6q7Mt4GVVemzeoCiSxAeCqgZHVeC6GRdvoT0e2ytOOfMJrkCgs0GS0WA1NEh2pTW
yhJTHxsFqgEZB1hWT3PfjZeoLjVADq8pLGWIW25u6QKBgQDjpAKA6KJRu7yJevYB
a7ZtuDfUP7XvwOckH3v4gaVaqr+5cxy7Lam4tQh5hnwlAudmDsDNYS4IMa5kQ77w
kPyFRe/tkTORczL/1H58aaMgWBjvEdf8i3FCzzYN3Y4ACMgjHfgh/gVuesZmhIza
lb8nFBp2Dw1ZgnXAXUxc3CGUfQKBgQDJUiFxRi+eKI0Ka1legbXaIk0xz9xmw00S
dZoVc3gW4nxFi1txW3uhU+4sgCa0U1X/5D+a3WIRpFLrjNr+s5nM5Gp6KDUuZK21
FkI5jBBFRAfGR81bGjji4hTN+NBuPWmu+RJSUXjG7jJsH0X17zh+7xgCTTmXpxff
oG2QqTymuQKBgAIZFNzTSAuwy0AJHhNNRtUkCX+vRqH7CSZQE/hqWXfIcxPmd7FR
7mqBYJ6eGq7MpA1QvX4nEyGIM69A4JWfAHTJ/DgYSn1grmulLbU/0/0MUs6BP5hY
QKb4+eqOzCw76HxKXmsRyEMIZqOzPQkWsDhP+x5zbRASH7uyIG4KqVSRAoGAXUb1
gcNQOsp1FtfIL5aPyILOG39Akkh5BE2C19+JS6kihSJdevc1H/mASBQUWsal+Qsr
QTjDwILPfJ3ltc9HOny2rOTGRzmUlmu6wWkY/M7Zf1AzYLuUkeLIWuqmv/0qY0y5
5XQkLp+csyYGRz3QgleLWz2mqpJb6Fwvh7AyDtkCgYEAnbg2QNcoOrF5R+UvEvle
QpVslba3bG7GZQTSZdaG2/2tYOf/vI+yGsXi+63FDNowvlELFI833NQ05ijkqhOt
FKRo730pM3hog7uPI74OlTeTmBmBype9ePT27AAx7fyx6VDK0500vIlsjgd6BqKf
i+g2/dIMEyPpiNO7W3GosVQ=
-----END PRIVATE KEY-----
"""


@pytest.fixture
def certificate(tmp_path):
    cert = tmp_path / "localhost.pem"
    key = tmp_path / "localhost-key.pem"
    cert.write_text(_CERTIFICATE, encoding="ascii")
    key.write_text(_TEST_KEY, encoding="ascii")
    return cert, key


class _ResponseReader:
    def __init__(self, peer):
        self.peer = peer

    def readline(self, size=-1):
        return self.peer.readline().decode("ascii")

    def close(self):
        pass


class _OfflineSocket:
    """FTP transport double; TLS records below use real SSLObjects."""
    family = socket.AF_INET

    def __init__(self, commands):
        self.commands = commands
        self.response = b"220 Offline FTPS peer\r\n"
        self.client_tls = self.server_tls = None
        self.client_in = self.client_out = None
        self.server_in = self.server_out = None
        self.closed = False

    def makefile(self, *args, **kwargs):
        return _ResponseReader(self)

    def close(self):
        self.closed = True

    def _answer(self, data):
        command = data.decode("ascii").rstrip("\r\n")
        self.commands.append(command)
        if command == "AUTH TLS":
            return b"234 Begin TLS\r\n"
        if command.startswith("USER "):
            return b"331 Password required\r\n"
        if command.startswith("PASS "):
            return b"230 Logged in\r\n"
        if command in ("PBSZ 0", "PROT P"):
            return b"200 OK\r\n"
        if command == "QUIT":
            return b"221 Bye\r\n"
        raise AssertionError(f"Unexpected FTP command: {command}")

    def sendall(self, data):
        if self.client_tls is None:
            self.response = self._answer(data)
            return
        self.client_tls.write(data)
        self.server_in.write(self.client_out.read())
        self.server_tls.write(self._answer(self.server_tls.read()))
        self.client_in.write(self.server_out.read())

    def readline(self):
        if self.client_tls is not None:
            return self.client_tls.read()
        response, self.response = self.response, b""
        return response

    def authenticate(self, client_context, server_context, hostname):
        self.client_in, self.client_out = ssl.MemoryBIO(), ssl.MemoryBIO()
        self.server_in, self.server_out = ssl.MemoryBIO(), ssl.MemoryBIO()
        self.client_tls = client_context.wrap_bio(
            self.client_in, self.client_out, server_hostname=hostname)
        self.server_tls = server_context.wrap_bio(
            self.server_in, self.server_out, server_side=True)
        client_done = server_done = False
        for _ in range(10):
            try:
                self.client_tls.do_handshake()
                client_done = True
            except ssl.SSLWantReadError:
                pass
            self.server_in.write(self.client_out.read())
            try:
                self.server_tls.do_handshake()
                server_done = True
            except ssl.SSLWantReadError:
                pass
            self.client_in.write(self.server_out.read())
            if client_done and server_done:
                return self
        raise AssertionError("Offline TLS handshake did not complete")


@contextmanager
def ftps_peer(monkeypatch, certificate):
    commands = []
    peer = _OfflineSocket(commands)
    server_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    server_context.load_cert_chain(*map(str, certificate))
    requests = []

    def create_connection(address, timeout, source_address):
        requests.append(address)
        assert len(requests) == 1
        return peer

    def wrap_socket(context, sock, *, server_hostname):
        assert sock is peer
        assert server_hostname == requests[0][0]
        return peer.authenticate(context, server_context, server_hostname)

    monkeypatch.setattr(socket, "create_connection", create_connection)
    monkeypatch.setattr(ssl.SSLContext, "wrap_socket", wrap_socket)
    try:
        yield commands
    finally:
        assert peer.closed, "Failed or completed connections must close"


def credentials(host="localhost"):
    return {"FTP_HOST": host, "FTP_USER": "test-user", "FTP_PASS": "test-password"}


def test_untrusted_certificate_is_rejected_before_credentials(monkeypatch, certificate):
    with ftps_peer(monkeypatch, certificate) as commands:
        with pytest.raises(ssl.SSLCertVerificationError):
            ftps_deploy.connect(credentials())
    assert commands == ["AUTH TLS"]


def test_trusted_certificate_with_wrong_hostname_is_rejected_before_credentials(
        monkeypatch, certificate):
    monkeypatch.setenv("SSL_CERT_FILE", str(certificate[0]))
    with ftps_peer(monkeypatch, certificate) as commands:
        with pytest.raises(ssl.SSLCertVerificationError):
            ftps_deploy.connect(credentials("different-host.invalid"))
    assert commands == ["AUTH TLS"]


def test_inherited_ca_trust_accepts_matching_host_and_protects_data_channel(
        monkeypatch, certificate):
    monkeypatch.setenv("SSL_CERT_FILE", str(certificate[0]))
    with ftps_peer(monkeypatch, certificate) as commands:
        ftp = ftps_deploy.connect(credentials())
        try:
            assert ftp.sock.client_tls.version() is not None
            assert ftp.context.verify_mode == ssl.CERT_REQUIRED
            assert ftp.context.check_hostname
            assert ftp._prot_p
        finally:
            ftp.quit()
    assert commands == ["AUTH TLS", "USER test-user", "PASS test-password",
                        "PBSZ 0", "PROT P", "QUIT"]
