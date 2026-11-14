"""Small GTK recovery window, installed on /home independently of project disk."""
import threading
import gi

gi.require_version('Gtk', '4.0')
from gi.repository import Gtk, GLib


def show(control, smoke=False):
    app = Gtk.Application(application_id='org.abyssdeck.Companion')

    def activate(application):
        if application.get_active_window():
            application.get_active_window().present()
            return
        window = Gtk.ApplicationWindow(application=application, title='AbyssDeck Companion')
        window.set_default_size(610, 600)
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=14)
        for side in ('top', 'bottom', 'start', 'end'):
            getattr(box, 'set_margin_' + side)(20)
        window.set_child(box)
        title = Gtk.Label(label='AbyssDeck', xalign=0)
        title.add_css_class('title-1')
        box.append(title)
        subtitle = Gtk.Label(label='Запуск и восстановление связи с веб-приложением', xalign=0, wrap=True)
        box.append(subtitle)
        buttons = []
        message = Gtk.Label(label='', xalign=0, wrap=True, selectable=True)
        details = Gtk.TextView(editable=False, cursor_visible=False, wrap_mode=Gtk.WrapMode.WORD_CHAR)
        scroll = Gtk.ScrolledWindow(vexpand=True, min_content_height=220)
        scroll.set_child(details)

        def busy(value):
            for button in buttons:
                button.set_sensitive(not value)

        def work(action=None):
            busy(True)
            message.set_text('Проверяю…' if action is None else 'Выполняю…')
            def run():
                try:
                    result = control.action(action, confirmed=True) if action else ''
                    status = control.status()
                    error = False
                except Exception as exc:
                    result, status, error = str(exc), '', True
                def finish():
                    message.set_text(('Ошибка: ' if error else '') + (result or 'Проверка завершена'))
                    if status:
                        details.get_buffer().set_text(status)
                    busy(False)
                    return False
                GLib.idle_add(finish)
            threading.Thread(target=run, daemon=True).start()

        def confirm(action):
            target = 'локального Codex' if action == 'restart-client' else 'сервера AbyssDeck'
            dialog = Gtk.MessageDialog(transient_for=window, modal=True,
                                       message_type=Gtk.MessageType.WARNING,
                                       buttons=Gtk.ButtonsType.NONE,
                                       text='Перезапустить ' + target + '?')
            dialog.format_secondary_text('Текущая работа через выбранные службы может прерваться. История и черновики сохранятся; сообщения автоматически не повторяются.')
            dialog.add_button('Отмена', Gtk.ResponseType.CANCEL)
            dialog.add_button('Перезапустить', Gtk.ResponseType.ACCEPT)
            dialog.set_default_response(Gtk.ResponseType.CANCEL)
            def response(widget, value):
                widget.destroy()
                if value == Gtk.ResponseType.ACCEPT:
                    work(action)
            dialog.connect('response', response)
            dialog.present()

        for items in [
            [('Открыть AbyssDeck', 'open'), ('Проверить связь', None)],
            [('Запустить Codex', 'start'), ('Перезапустить Codex', 'restart-client')],
            [('Перезапустить сервер', 'restart-server')],
        ]:
            row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8, homogeneous=True)
            for label, action in items:
                button = Gtk.Button(label=label)
                button.set_size_request(-1, 42)
                button.connect('clicked', lambda _, a=action: confirm(a) if a and a.startswith('restart-') else work(a))
                row.append(button)
                buttons.append(button)
            box.append(row)
        box.append(message)
        box.append(scroll)
        window.present()
        if smoke:
            assert len(buttons) == 5 and window.get_visible()
            print('GTK_WINDOW_OK', flush=True)
            GLib.timeout_add(500, lambda: application.quit())
        else:
            work()
    app.connect('activate', activate)
    app.run([])
