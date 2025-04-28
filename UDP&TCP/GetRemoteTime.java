import java.awt.*;
import java.awt.event.*;
import javax.swing.*;
import java.net.*;
import java.io.*;
import java.util.*;

public class GetRemoteTime extends JFrame
						implements ActionListener
{
	private JTextField hostInput;
	private JTextArea display;
	private JButton timeButton;
	private JButton exitButton;
	private JPanel buttonPanel;
	private static Socket socket = null;

	public static void main(String[] args)
	{
		GetRemoteTime frame = new GetRemoteTime();
		frame.setSize(400,300);
		frame.setVisible(true);

		frame.addWindowListener(
			new WindowAdapter()
			{
				public void windowClosing(WindowEvent e)
				{
					//Check whether a socket is open...
					if (socket != null)
					{
						try
						{
							socket.close();
						}
						catch (IOException ioEx)
						{
							System.out.println(
							  "\n*** Unable to close link!***\n");
							System.exit(1);
						}
					}
					System.exit(0);
				}
			}
		);
	}

	public GetRemoteTime()
	{
		hostInput = new JTextField(20);
		add(hostInput, BorderLayout.NORTH);

		display = new JTextArea(10,15);

		//The following two lines ensure that word-wrapping
		//occurs within the JTextArea...
		display.setWrapStyleWord(true);
		display.setLineWrap(true);

		add(new JScrollPane(display),BorderLayout.CENTER);

		buttonPanel = new JPanel();

		timeButton = new JButton("Get date and time ");
		timeButton.addActionListener(this);
		buttonPanel.add(timeButton);

		exitButton = new JButton("Exit");
		exitButton.addActionListener(this);
		buttonPanel.add(exitButton);

		add(buttonPanel,BorderLayout.SOUTH);
	}

	public void actionPerformed(ActionEvent event)
	{
		if (event.getSource() == exitButton)
			System.exit(0);

		String theTime;

		//Accept host name from the user...
		String host = hostInput.getText();
		final int DAYTIME_PORT = 13;

		try
		{
			//Create a Socket object to connect to the
			//specified host on the relevant port...
			socket = new Socket(host, DAYTIME_PORT);

			//Create an input stream for the above Socket
			//and add string-reading functionality...
			Scanner input = new Scanner(socket.getInputStream());

			//Accept the host’s response via the above
			//stream...
			theTime = input.nextLine();

			//Add the host’s response to the text in the
			//JTextArea...
			display.append("The date/time at " + host + " is "
										+ theTime + "\n");
			hostInput.setText("");
		}
		catch (UnknownHostException uhEx)
		{
			display.append("No such host!\n");
			hostInput.setText("");
		}
		catch (IOException ioEx)
		{
			display.append(ioEx.toString() + "\n");
		}

		finally
		{
			try
			{
				if (socket!=null)
					socket.close();	//Close connection to the host.
			}
			catch(IOException ioEx)
			{
				System.out.println("Unable to disconnect!");
				System.exit(1);
			}
		}
	}
}
