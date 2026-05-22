type Command = {
  name: string;
  desc: string;
  action: (...args: string[]) => void;
};

type CommandGroup = {
  name: string;
  commands: Command[];
};

type Alias = {
  alias: string[];
  command: string;
};

type CommandManager = {
  groups: CommandGroup[];
  aliases: Alias[];
};

const createCommandManager = (): CommandManager => ({
  groups: [],
  aliases: []
});

const addCommand = (manager: CommandManager, groupName: string, command: Command): CommandManager => {
  const groupIndex = manager.groups.findIndex(group => group.name === groupName);

  if (groupIndex === -1) {
    manager.groups.push({ name: groupName, commands: [command] });
  } else {
    manager.groups[groupIndex].commands.push(command);
  }

  return manager;
};

const addAlias = (manager: CommandManager, alias: string | string[], commandName: string): CommandManager => {
  const aliases = Array.isArray(alias) ? alias : [alias];
  manager.aliases.push({ alias: aliases, command: commandName });
  return manager;
};

const getCommand = (manager: CommandManager, commandName: string): Command | null => {
  for (const group of manager.groups) {
    const command = group.commands.find(c => c.name === commandName);
    if (command) {
      return command;
    }
  }
  return null;
};

const getCommandGroup = (manager: CommandManager, groupName: string): CommandGroup | null => {
  return manager.groups.find(group => group.name === groupName) || null;
};

const getCommandGroups = (manager: CommandManager): CommandGroup[] => {
  return manager.groups;
};

const getAliases = (manager: CommandManager): Alias[] => {
  return manager.aliases;
};

const getCommandNames = (manager: CommandManager): string[] => {
  const names: string[] = [];
  for (const group of manager.groups) {
    for (const command of group.commands) {
      names.push(command.name);
    }
  }
  return names;
};

const getCommandsWithAliases = (manager: CommandManager): Command[] => {
  const commands = [];
  for (const group of manager.groups) {
    for (const command of group.commands) {
      commands.push(command);
      const aliases = manager.aliases.filter(alias => alias.command === command.name);
      for (const alias of aliases) {
        commands.push({
          name: alias.alias[0],
          desc: `Alias for ${command.name}`,
          action: command.action
        });
      }
    }
  }
  return commands;
};

const executeCommand = (manager: CommandManager, commandName: string): void => {
  const command = getCommand(manager, commandName);
  if (command) {
    command.action();
  } else {
    console.error(`Command not found: ${commandName}`);
  }
};

const executeCommandWithArgs = (manager: CommandManager, commandString: string): void => {
  const parts = commandString.trim().split(/\s+/);
  const commandName = parts[0];
  const command = getCommand(manager, commandName);
  if (command) {
    command.action(...parts.slice(1));
  } else {
    console.error(`Command not found: ${commandName}`);
  }
};

const executeAlias = (manager: CommandManager, aliasName: string): void => {
  const alias = manager.aliases.find(alias => alias.alias.includes(aliasName));
  if (alias) {
    executeCommand(manager, alias.command);
  } else {
    console.error(`Alias not found: ${aliasName}`);
  }
};

const executeCommandOrAlias = (manager: CommandManager, commandString: string): void => {
  const parts = commandString.trim().split(/\s+/);
  const commandName = parts[0];
  const alias = manager.aliases.find(alias => alias.alias.includes(commandName));
  if (alias) {
    executeCommand(manager, alias.command);
  } else {
    executeCommandWithArgs(manager, commandString);
  }
};

export {
  createCommandManager,
  addCommand,
  addAlias,
  getCommand,
  getCommandGroup,
  getCommandGroups,
  getAliases,
  getCommandNames,
  getCommandsWithAliases,
  executeCommand,
  executeCommandWithArgs,
  executeAlias,
  executeCommandOrAlias
};
